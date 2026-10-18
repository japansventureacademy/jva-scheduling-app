export default function TermsOfService() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: October 18, 2026</p>

      <div className="mt-8 space-y-6 leading-7">
        <section>
          <h2 className="text-xl font-semibold">Purpose</h2>
          <p className="mt-2">
            The JVA Interview Scheduler is provided by Japan Venture Academy to help applicants
            and authorized staff arrange recruitment interviews.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Acceptable use</h2>
          <p className="mt-2">
            You agree to provide accurate booking information, book only for legitimate JVA
            interviews, and not interfere with the service, probe its security, automate abusive
            requests, or access information that does not belong to you.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Bookings</h2>
          <p className="mt-2">
            A submitted booking creates a calendar invitation when the requested time remains
            available. JVA may reschedule or cancel an interview when necessary and will use the
            supplied contact information to communicate changes.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Availability</h2>
          <p className="mt-2">
            The service is provided on an as-available basis. We may update, suspend, or
            discontinue it and do not guarantee uninterrupted or error-free operation.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Privacy</h2>
          <p className="mt-2">
            Our handling of personal information is described in the Privacy Policy available on
            this site.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="mt-2">
            Questions about these terms may be sent to japansventureacademy@gmail.com.
          </p>
        </section>
      </div>
    </main>
  );
}
