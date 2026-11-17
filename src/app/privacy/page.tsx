import type { Metadata } from "next";
import { LegalPage, LEGAL_COMPANY, LEGAL_CONTACT_EMAIL } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy | Aesta",
  description: "How Aesta Construction Manager collects, uses and protects information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="17 November 2026"
      other={{ href: "/terms", label: "Terms of use" }}
      intro={
        <p>
          Aesta Construction Manager (&quot;Aesta&quot;) is a work app run by {LEGAL_COMPANY} for
          managing construction sites. Only people a company admin has invited can sign in. This
          page explains what information Aesta keeps, why, and who can see it.
        </p>
      }
      sections={[
        {
          heading: "What we collect",
          body: (
            <ul>
              <li>
                <strong>Your account:</strong> your name, email address, phone number if added, role
                and the sites you work on. When you sign in with Google or Microsoft we receive your
                name, email address and profile picture from them. We never see your Google or
                Microsoft password.
              </li>
              <li>
                <strong>Work records you or your team enter:</strong> attendance, wages and
                payments, expenses, materials, vendor and client details, bills, photos, documents
                and tasks.
              </li>
              <li>
                <strong>Technical details:</strong> sign-in times, the device and browser you use,
                and error reports, so we can keep the app secure and fix problems.
              </li>
            </ul>
          ),
        },
        {
          heading: "How we use it",
          body: (
            <ul>
              <li>To let you sign in and to check that you were invited.</li>
              <li>To run the features you use, such as attendance, payments and site reports.</li>
              <li>To send you notifications you have turned on.</li>
              <li>To keep a record of who made each change, so the company can review its own work.</li>
              <li>To keep the app secure and working.</li>
            </ul>
          ),
        },
        {
          heading: "What we do not do",
          body: (
            <ul>
              <li>We do not sell your information.</li>
              <li>We do not show advertising or use your information for advertising.</li>
              <li>We do not use Google or Microsoft sign-in data for anything other than signing you in.</li>
            </ul>
          ),
        },
        {
          heading: "Who can see it",
          body: (
            <>
              <p>
                People in your company can see work records according to their role. Admins of
                your company can see and manage the accounts they invited.
              </p>
              <p>We use trusted services to run Aesta. They handle data only to provide their service to us:</p>
              <ul>
                <li>Supabase, for the database, file storage and sign-in.</li>
                <li>Vercel and Cloudflare, for hosting and delivering the app.</li>
                <li>Google and Microsoft, only if you choose to sign in with them.</li>
                <li>
                  Google Gemini and Groq, to read bills and photos you upload and to answer the
                  in-app assistant. Only the content you send to these features is shared.
                </li>
                <li>
                  Neram Admin, run by Neram Classes, if your company uses it for shared tasks. Only
                  the task details are shared.
                </li>
              </ul>
              <p>We may share information if the law requires it.</p>
            </>
          ),
        },
        {
          heading: "How long we keep it",
          body: (
            <p>
              Work records are kept while your company uses Aesta, because they are business
              records such as wages and payments. When an account is removed, the person can no
              longer sign in, but their name stays on the records they created so the history stays
              correct. Your company can ask us to delete its data when it stops using Aesta.
            </p>
          ),
        },
        {
          heading: "Keeping it safe",
          body: (
            <p>
              Data is sent over encrypted connections and stored with access controls. Only invited
              people can sign in, and access can be turned off at any time by an admin.
            </p>
          ),
        },
        {
          heading: "Your choices",
          body: (
            <p>
              You can ask to see, correct or delete your personal details by writing to{" "}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> or to your company
              admin. Some work records may need to be kept for accounting or legal reasons.
            </p>
          ),
        },
        {
          heading: "Changes to this policy",
          body: (
            <p>
              If we change this policy we will update the date at the top of this page. Important
              changes will be shown in the app.
            </p>
          ),
        },
      ]}
    />
  );
}
