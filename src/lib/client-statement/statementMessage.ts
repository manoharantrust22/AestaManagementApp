/**
 * Polite cover message that accompanies a shared Statement of Account
 * (WhatsApp text / share-sheet caption). English and Tamil.
 *
 * Tone: a neutral record for the client to verify — never a demand. It always
 * invites the client to point out differences so they can be reconciled
 * before the due date / handover.
 */
import dayjs from "dayjs";
import { formatRupees, formatStatementDate, formatStatementDateWithDay, type ClientStatement } from "./buildClientStatement";

export type StatementMessageLang = "en" | "ta";

const TA_MONTHS = [
  "ஜனவரி", "பிப்ரவரி", "மார்ச்", "ஏப்ரல்", "மே", "ஜூன்",
  "ஜூலை", "ஆகஸ்ட்", "செப்டம்பர்", "அக்டோபர்", "நவம்பர்", "டிசம்பர்",
];
const TA_DAYS = ["ஞாயிறு", "திங்கள்", "செவ்வாய்", "புதன்", "வியாழன்", "வெள்ளி", "சனி"];

function taDate(d: string, withDay = false): string {
  const p = dayjs(d);
  if (!p.isValid()) return d;
  const base = `${p.date()} ${TA_MONTHS[p.month()]} ${p.year()}`;
  return withDay ? `${base} (${TA_DAYS[p.day()]})` : base;
}

export interface StatementMessageInput {
  statement: ClientStatement;
  greetingName: string;
  lang: StatementMessageLang;
}

export function buildStatementMessage({ statement: s, greetingName, lang }: StatementMessageInput): string {
  return lang === "ta" ? tamil(s, greetingName) : english(s, greetingName);
}

function english(s: ClientStatement, greetingName: string): string {
  const company = s.company.name;
  const { totalContract, received, balanceDue, credit } = s.summary;
  const handover = s.due.kind === "handover" ? s.due : null;
  const docName = s.titleVariant === "final" ? "final settlement statement" : "statement of account";

  const lines: string[] = [];
  lines.push(`Dear ${greetingName.trim() || "Sir/Madam"},`);
  lines.push("");

  const intro = handover
    ? `Greetings from ${company}. Ahead of the key handover of your home on ${formatStatementDateWithDay(handover.date)}, please find attached the ${docName} for ${s.site.name}`
    : `Greetings from ${company}. Please find attached the ${docName} for ${s.site.name} as on ${formatStatementDate(s.asOfDate)}`;
  lines.push(`${intro}. It lists the agreed contract, the additional works you approved, and every payment received with dates.`);
  lines.push("");

  lines.push(`Total project value: ${formatRupees(totalContract)}`);
  lines.push(`Received so far: ${formatRupees(received)}`);
  if (balanceDue > 0) {
    if (s.due.kind === "handover") lines.push(`*Balance to be settled at the key handover: ${formatRupees(balanceDue)}*`);
    else if (s.due.kind === "date") lines.push(`*Balance payable by ${formatStatementDate(s.due.date)}: ${formatRupees(balanceDue)}*`);
    else lines.push(`*Balance outstanding: ${formatRupees(balanceDue)}*`);
  } else if (credit > 0) {
    lines.push(`*Excess received: ${formatRupees(credit)}*. We will adjust or refund this with you.`);
  } else {
    lines.push(`*Your account is fully settled. Thank you!*`);
  }
  lines.push("");

  lines.push(
    handover
      ? "Kindly go through it at your convenience. If anything differs from your records, please let us know and we will gladly reconcile it before the handover."
      : "Kindly go through it at your convenience. If anything differs from your records, please let us know and we will gladly reconcile it.",
  );
  lines.push("");
  lines.push(handover ? "Thank you for trusting us with your home." : "Thank you for your continued trust.");
  lines.push("Warm regards,");
  lines.push(company);
  return lines.join("\n");
}

function tamil(s: ClientStatement, greetingName: string): string {
  const company = s.company.name;
  const { totalContract, received, balanceDue, credit } = s.summary;
  const handover = s.due.kind === "handover" ? s.due : null;

  const lines: string[] = [];
  lines.push(`வணக்கம் ${greetingName.trim()},`.replace(" ,", ","));
  lines.push("");
  const intro = handover
    ? `${company} சார்பாக அன்பான வாழ்த்துகள். ${taDate(handover.date, true)} அன்று உங்கள் வீட்டின் சாவி ஒப்படைப்புக்கு முன்னதாக, ${s.site.name} திட்டத்தின் கணக்கு அறிக்கையை (Statement of Account) இணைத்துள்ளோம்.`
    : `${company} சார்பாக அன்பான வாழ்த்துகள். ${taDate(s.asOfDate)} வரையிலான ${s.site.name} திட்டத்தின் கணக்கு அறிக்கையை (Statement of Account) இணைத்துள்ளோம்.`;
  lines.push(intro);
  lines.push("இதில் ஒப்பந்தத் தொகை, நீங்கள் ஒப்புதல் அளித்த கூடுதல் வேலைகள், நீங்கள் செலுத்திய அனைத்து தொகைகளும் தேதிகளுடன் உள்ளன.");
  lines.push("");
  lines.push(`மொத்த திட்ட மதிப்பு: ${formatRupees(totalContract)}`);
  lines.push(`இதுவரை பெறப்பட்டது: ${formatRupees(received)}`);
  if (balanceDue > 0) {
    if (s.due.kind === "handover") lines.push(`*சாவி ஒப்படைப்பின் போது செலுத்த வேண்டிய மீதித் தொகை: ${formatRupees(balanceDue)}*`);
    else if (s.due.kind === "date") lines.push(`*${taDate(s.due.date)} க்குள் செலுத்த வேண்டிய மீதித் தொகை: ${formatRupees(balanceDue)}*`);
    else lines.push(`*செலுத்த வேண்டிய மீதித் தொகை: ${formatRupees(balanceDue)}*`);
  } else if (credit > 0) {
    lines.push(`*கூடுதலாகப் பெறப்பட்டது: ${formatRupees(credit)}*. இதை உங்களுடன் கலந்து சரிசெய்து கொள்கிறோம்.`);
  } else {
    lines.push("*உங்கள் கணக்கு முழுமையாகத் தீர்க்கப்பட்டது. நன்றி!*");
  }
  lines.push("");
  lines.push(
    handover
      ? "தயவுசெய்து சரிபார்த்து, உங்கள் கணக்குடன் ஏதேனும் வேறுபாடு இருந்தால் எங்களுக்குத் தெரிவிக்கவும்; ஒப்படைப்புக்கு முன்பே சரிசெய்து கொள்ளலாம்."
      : "தயவுசெய்து சரிபார்த்து, உங்கள் கணக்குடன் ஏதேனும் வேறுபாடு இருந்தால் எங்களுக்குத் தெரிவிக்கவும்.",
  );
  lines.push("");
  lines.push("எங்கள் மீது நீங்கள் வைத்த நம்பிக்கைக்கு மனமார்ந்த நன்றி.");
  lines.push(company);
  return lines.join("\n");
}

/** Short file name for the shared PDF: Statement_Srinivasan-House-Shop_2026-11-18.pdf */
export function statementFileName(s: ClientStatement): string {
  const slug = s.site.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Site";
  const prefix = s.titleVariant === "final" ? "Final-Settlement" : "Statement";
  return `${prefix}_${slug}_${s.asOfDate}.pdf`;
}
