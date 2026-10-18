export default function PrivacyPolicy() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: October 18, 2026</p>

      <div className="mt-8 space-y-6 leading-7">
        <section>
          <h2 className="text-xl font-semibold">Information we collect</h2>
          <p className="mt-2">
            The JVA Interview Scheduler collects the information you submit when booking an
            interview, such as your name, email address, selected time, and any optional notes.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">How we use information</h2>
          <p className="mt-2">
            We use this information only to arrange and administer recruitment interviews,
            prevent scheduling conflicts, communicate booking details, and create the related
            Google Calendar event and Google Meet link.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Google Calendar access</h2>
          <p className="mt-2">
            The service uses a Japan Venture Academy Google account to create and manage
            interview events. Applicants are not asked to connect their own Google accounts.
            Calendar credentials remain server-side and are not exposed to visitors.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Sharing and retention</h2>
          <p className="mt-2">
            We do not sell personal information. Booking details are shared only with authorized
            JVA staff and service providers needed to operate scheduling. We retain information
            only as long as reasonably necessary for recruitment, administration, security, and
            legal obligations.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Your choices</h2>
          <p className="mt-2">
            To ask about, correct, or request deletion of your booking information, email
            japansventureacademy@gmail.com.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="mt-2">
            Japan Venture Academy — japansventureacademy@gmail.com
          </p>
        </section>
      </div>
    </main>
  );
}
