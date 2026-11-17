import type { Metadata } from "next";
import { LegalPage, LEGAL_COMPANY, LEGAL_CONTACT_EMAIL } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of use | Aesta",
  description: "The rules for using Aesta Construction Manager.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="17 November 2026"
      other={{ href: "/privacy", label: "Privacy policy" }}
      intro={
        <p>
          These terms apply to everyone who uses Aesta Construction Manager (&quot;Aesta&quot;),
          run by {LEGAL_COMPANY}. By signing in you agree to them.
        </p>
      }
      sections={[
        {
          heading: "Who can use Aesta",
          body: (
            <p>
              Aesta is for invited people only. A company admin adds you, and you sign in with the
              account they added. Do not share your sign-in with anyone else, and tell your admin
              straight away if you think someone else has used it.
            </p>
          ),
        },
        {
          heading: "Using it properly",
          body: (
            <ul>
              <li>Enter records honestly and as accurately as you can.</li>
              <li>Use Aesta only for your company&apos;s work.</li>
              <li>Do not try to see data you were not given access to, or to break or overload the app.</li>
              <li>Do not upload anything unlawful or anything you do not have the right to share.</li>
            </ul>
          ),
        },
        {
          heading: "Your company's data",
          body: (
            <p>
              The records your company enters belong to your company. We look after them as
              described in the <a href="/privacy">privacy policy</a>. Your company is responsible
              for who it invites and for checking its own records, such as wages and payments,
              before relying on them.
            </p>
          ),
        },
        {
          heading: "Access can be turned off",
          body: (
            <p>
              An admin can turn off your access at any time, for example when you leave the
              company. We may also suspend access if these terms are broken or to protect the app
              and its users.
            </p>
          ),
        },
        {
          heading: "The service",
          body: (
            <p>
              We work to keep Aesta available and correct, but it is provided as it is, and there
              may be breaks for maintenance or problems outside our control. Features that read
              bills or photos automatically can make mistakes, so check what they fill in. We are
              not liable for losses caused by relying on the app without checking.
            </p>
          ),
        },
        {
          heading: "Changes",
          body: (
            <p>
              We may update these terms. We will change the date at the top of this page, and show
              important changes in the app. Using Aesta after a change means you accept it.
            </p>
          ),
        },
        {
          heading: "Law",
          body: (
            <p>
              These terms are governed by the laws of India, and the courts of Tamil Nadu have
              jurisdiction. For any question, write to{" "}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
