import nodemailer from 'nodemailer';
import { db, getSettings, logActivity } from '../db.js';
import { HttpError, fmtDate, fmtDuration, fmtMinutes, fmtTime12, slotEnd, slotStart } from '../util.js';
import { getPlanDetail } from './plans.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function smtpConfigured(settings = getSettings()) {
  return !!(settings.smtp_host && String(settings.smtp_host).trim());
}

function transport(settings) {
  if (!smtpConfigured(settings)) return { t: nodemailer.createTransport({ jsonTransport: true }), preview: true };
  return {
    t: nodemailer.createTransport({
      host: settings.smtp_host,
      port: Number(settings.smtp_port) || 587,
      secure: !!settings.smtp_secure,
      auth: settings.smtp_user ? { user: settings.smtp_user, pass: settings.smtp_pass } : undefined,
    }),
    preview: false,
  };
}

function fromAddress(settings) {
  const addr = settings.smtp_from || settings.smtp_user || 'examcell@localhost';
  return addr.includes('<') ? addr : `"${settings.exam_cell_name || settings.institution_name}" <${addr}>`;
}

function icsDate(date, minutes) {
  return `${date.replace(/-/g, '')}T${fmtMinutes(minutes).replace(':', '')}00`;
}

function buildIcs({ uid, date, startMin, endMin, summary, location, description }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const fold = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ExamFlow//Exam Duty//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDate(date, startMin)}`,
    `DTEND:${icsDate(date, endMin)}`,
    `SUMMARY:${fold(summary)}`,
    `LOCATION:${fold(location)}`,
    `DESCRIPTION:${fold(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Invigilation duty reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function shell(settings, inner) {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#4f46e5;padding:20px 28px;color:#ffffff">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">${esc(settings.exam_cell_name)}</div>
  <div style="font-size:20px;font-weight:600;margin-top:4px">${esc(settings.institution_name)}</div>
</td></tr>
<tr><td style="padding:28px">${inner}</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0">
  This is an automated message from the examination cell. Please do not reply to this email.
</td></tr>
</table></td></tr></table></body></html>`;
}

const row = (k, v) =>
  `<tr><td style="padding:10px 12px;color:#64748b;font-size:13px;width:38%;border-bottom:1px solid #f1f5f9">${esc(k)}</td>
   <td style="padding:10px 12px;font-size:14px;font-weight:500;border-bottom:1px solid #f1f5f9">${v}</td></tr>`;

export function buildDutyEmail(detail, duty, settings) {
  const { slot, rooms, duties, seats } = detail;
  const room = rooms.find((r) => r.id === duty.room_id);
  const reportMin = slotStart(slot) - (Number(settings.report_before_min) || 0);
  const coInvigilators = duties.filter((d) => d.room_id && d.room_id === duty.room_id && d.teacher_id !== duty.teacher_id);
  const count = room ? seats.filter((s) => s.room_id === room.id).length : 0;
  const dateStr = fmtDate(slot.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = `${fmtTime12(slot.start_time)} – ${fmtTime12(fmtMinutes(slotEnd(slot)))}`;
  const where = room
    ? `${esc(room.name)}${room.building ? ` · ${esc(room.building)}` : ''}${room.floor ? ` · ${esc(room.floor)} floor` : ''}`
    : 'Examination cell (reserve pool)';
  const papers = [...new Set(seats.filter((s) => s.room_id === duty.room_id).map((s) => s.paper_id))]
    .map((pid) => slot.papers.find((p) => p.id === pid))
    .filter(Boolean)
    .map((p) => esc(`${p.course_code}${p.semester ? ` Sem ${p.semester}` : ''}${p.subject ? ` (${p.subject})` : ''}`))
    .join('<br>');

  const subject = `Invigilation duty: ${slot.exam_name} — ${fmtDate(slot.date, { day: 'numeric', month: 'short' })}, ${fmtTime12(slot.start_time)}`;
  const inner = `
  <p style="margin:0 0 6px;font-size:15px">Dear ${esc(duty.name)},</p>
  <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155">
    You have been assigned ${duty.role === 'reserve' ? '<b>reserve invigilation duty</b>' : '<b>invigilation duty</b>'} for the examination below.
    Please report <b>${esc(String(settings.report_before_min))} minutes</b> before the exam begins.
  </p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;overflow:hidden">
    ${row('Examination', esc(slot.exam_name))}
    ${row('Date', esc(dateStr))}
    ${row('Exam time', `${esc(timeStr)}`)}
    ${row('Duration', esc(fmtDuration(slot.duration_min)))}
    ${row('Report by', `<span style="color:#4f46e5">${esc(fmtTime12(fmtMinutes(reportMin)))}</span>`)}
    ${row('Classroom', where)}
    ${row('Role', duty.role === 'reserve' ? 'Reserve invigilator' : 'Invigilator')}
    ${room ? row('Students', `${count}`) : ''}
    ${papers ? row('Papers', papers) : ''}
    ${coInvigilators.length ? row('Co-invigilator(s)', coInvigilators.map((c) => esc(c.name)).join(', ')) : ''}
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6">
    A calendar invite is attached. If you are unable to attend, please inform the examination cell immediately so a replacement can be arranged.
  </p>
  ${settings.app_url ? `<p style="margin:20px 0 0"><a href="${esc(settings.app_url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">View my duties</a></p>` : ''}
  <p style="margin:24px 0 0;font-size:14px">Regards,<br><b>${esc(settings.controller_name)}</b><br><span style="color:#64748b">${esc(settings.exam_cell_name)}</span></p>`;

  const text = [
    `Dear ${duty.name},`,
    '',
    `You have been assigned ${duty.role === 'reserve' ? 'reserve ' : ''}invigilation duty.`,
    `Examination: ${slot.exam_name}`,
    `Date: ${dateStr}`,
    `Time: ${timeStr} (${fmtDuration(slot.duration_min)})`,
    `Report by: ${fmtTime12(fmtMinutes(reportMin))}`,
    `Classroom: ${room ? `${room.name}${room.building ? `, ${room.building}` : ''}` : 'Examination cell (reserve)'}`,
    coInvigilators.length ? `Co-invigilator(s): ${coInvigilators.map((c) => c.name).join(', ')}` : '',
    '',
    `Regards, ${settings.controller_name}`,
  ]
    .filter((l) => l !== null)
    .join('\n');

  const ics = buildIcs({
    uid: `duty-${detail.plan.id}-${duty.teacher_id}@examflow`,
    date: slot.date,
    startMin: reportMin,
    endMin: slotEnd(slot),
    summary: `Invigilation — ${room ? room.name : 'Reserve'} (${slot.exam_name})`,
    location: room ? `${room.name}${room.building ? `, ${room.building}` : ''}` : settings.exam_cell_name,
    description: `Exam ${timeStr}. Report by ${fmtTime12(fmtMinutes(reportMin))}.`,
  });
  return { subject, html: shell(settings, inner), text, ics };
}

export async function notifyPlan(planId, user, { teacherIds } = {}) {
  const settings = getSettings();
  const detail = getPlanDetail(planId);
  if (detail.plan.status === 'draft') throw new HttpError(409, 'Approve the plan before sending notifications.');
  const targets = detail.duties.filter((d) => !teacherIds || teacherIds.includes(d.teacher_id));
  if (!targets.length) throw new HttpError(400, 'There are no invigilators to notify in this plan.');
  const { t, preview } = transport(settings);
  const insert = db.prepare(
    'INSERT INTO emails (plan_id, teacher_id, to_email, to_name, subject, body_html, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const summary = { sent: 0, preview: 0, failed: 0 };
  for (const duty of targets) {
    const mail = buildDutyEmail(detail, duty, settings);
    if (!duty.email) {
      insert.run(planId, duty.teacher_id, null, duty.name, mail.subject, mail.html, 'failed', 'No email address on file');
      summary.failed++;
      continue;
    }
    try {
      await t.sendMail({
        from: fromAddress(settings),
        to: `"${duty.name}" <${duty.email}>`,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        icalEvent: { filename: 'invigilation-duty.ics', method: 'PUBLISH', content: mail.ics },
      });
      const status = preview ? 'preview' : 'sent';
      insert.run(planId, duty.teacher_id, duty.email, duty.name, mail.subject, mail.html, status, null);
      summary[status]++;
    } catch (e) {
      insert.run(planId, duty.teacher_id, duty.email, duty.name, mail.subject, mail.html, 'failed', e.message);
      summary.failed++;
    }
  }
  db.prepare("UPDATE plans SET status = 'notified', notified_at = ? WHERE id = ?").run(new Date().toISOString(), planId);
  logActivity(
    user,
    'Sent duty notifications',
    `${detail.slot.exam_name} · ${fmtDate(detail.slot.date)} — ${summary.sent + summary.preview} email(s)${summary.failed ? `, ${summary.failed} failed` : ''}`,
  );
  return { ...summary, preview_mode: preview };
}

export async function sendTestEmail(to) {
  const settings = getSettings();
  if (!smtpConfigured(settings)) throw new HttpError(400, 'Enter SMTP server details and save them first.');
  const { t } = transport(settings);
  try {
    await t.verify();
    await t.sendMail({
      from: fromAddress(settings),
      to,
      subject: 'ExamFlow test email',
      html: shell(
        settings,
        '<p style="font-size:15px;margin:0">Your email settings are working. Duty notifications will be delivered from this address.</p>',
      ),
      text: 'Your email settings are working.',
    });
  } catch (e) {
    throw new HttpError(400, `Could not send email: ${e.message}`);
  }
}
