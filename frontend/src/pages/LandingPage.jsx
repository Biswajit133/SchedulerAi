import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthAPI } from '../services/api';

export default function LandingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleGetStarted = async () => {
    setLoading(true);
    try {
      const res = await AuthAPI.getGoogleAuthUrl();
      window.location.href = res.url;
    } catch {
      navigate('/app');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur border-b border-slate-800/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/30">
              <CalendarIcon className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">SchedulerAI</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/pricing" className="text-slate-400 hover:text-white text-sm transition-colors">
              Pricing
            </a>
            <button
              onClick={() => navigate('/app')}
              className="text-slate-300 hover:text-white text-sm transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={handleGetStarted}
              disabled={loading}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-60"
            >
              {loading ? 'Redirecting…' : 'Get started free'}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-24 pb-20 overflow-hidden">
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(ellipse at top, #6366f1 0%, transparent 70%)' }} />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20
            rounded-full px-4 py-1.5 text-brand-400 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
            AI-Powered Meeting Scheduler
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight tracking-tight mb-6">
            Schedule any meeting
            <br />
            <span className="text-brand-400">in one sentence.</span>
          </h1>

          <p className="text-xl text-slate-400 leading-relaxed mb-10 max-w-2xl mx-auto">
            Describe your meeting in plain English. SchedulerAI reads your calendar,
            finds a free slot, and sends invites — automatically.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <button
              onClick={handleGetStarted}
              disabled={loading}
              className="btn-primary px-8 py-4 text-base font-semibold shadow-xl
                shadow-brand-600/25 disabled:opacity-60 w-full sm:w-auto"
            >
              {loading ? 'Redirecting…' : 'Try it free with Google'}
            </button>
          </div>

          <p className="text-slate-500 text-sm">
            Google Calendar · Zoom · Google Meet · No credit card required
          </p>
        </div>
      </section>

      {/* ── Mock Chat Demo ── */}
      <section className="px-6 pb-20">
        <div className="max-w-2xl mx-auto">
          <p className="text-center text-brand-400 text-sm font-semibold uppercase tracking-wider mb-6">
            See it in action
          </p>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl shadow-slate-950/50">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900/80">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <CalendarIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Scheduler AI</p>
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </p>
              </div>
            </div>
            {/* Messages */}
            <div className="p-5 space-y-4">
              {/* User message */}
              <div className="flex justify-end">
                <div className="bg-brand-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-br-sm max-w-xs shadow-lg">
                  Schedule a product review with Sarah this Friday at 3pm for 1 hour
                </div>
              </div>
              {/* Bot thinking */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-brand-600/20 border border-brand-500/20
                  flex items-center justify-center shrink-0 mt-0.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-brand-400" />
                </div>
                <div className="bg-slate-800 border border-slate-700 text-slate-300 text-sm
                  px-4 py-2.5 rounded-2xl rounded-tl-sm max-w-xs">
                  Got it! Checking your calendar for Friday at 3:00 PM...
                </div>
              </div>
              {/* Bot success */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-brand-600/20 border border-brand-500/20
                  flex items-center justify-center shrink-0 mt-0.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-brand-400" />
                </div>
                <div className="bg-slate-800 border border-emerald-500/30 text-slate-300 text-sm
                  px-4 py-2.5 rounded-2xl rounded-tl-sm max-w-sm space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Meeting Scheduled!
                  </div>
                  <p className="text-slate-300">Product Review · Friday 3:00–4:00 PM</p>
                  <p className="text-slate-400 text-xs">Sarah has been invited · Google Meet link created</p>
                  <a href="#" className="text-brand-400 text-xs hover:underline">View in Google Calendar →</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            Everything handled for you
          </h2>
          <p className="text-slate-400 text-center mb-12">
            No more back-and-forth emails. No more calendar juggling.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: '🤖',
                title: 'Plain English Input',
                desc: 'Just describe your meeting naturally. "Call with Jake next Tuesday at 2pm" is all you need.',
              },
              {
                icon: '📅',
                title: 'Real Calendar Awareness',
                desc: 'Checks your actual Google Calendar before suggesting times. No double-bookings, ever.',
              },
              {
                icon: '✉️',
                title: 'Automatic Invites',
                desc: 'Sends Google Calendar invites to all participants the moment you confirm.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="card text-center">
                <div className="text-4xl mb-4">{icon}</div>
                <h3 className="text-white font-semibold mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-6 pb-20 bg-slate-900/30">
        <div className="max-w-3xl mx-auto py-16">
          <h2 className="text-3xl font-bold text-white text-center mb-12">How it works</h2>
          <div className="space-y-8">
            {[
              { step: '1', title: 'Describe your meeting', desc: 'Type it like you\'d say it — "Schedule a budget review with the team on Thursday at 11am for 45 minutes."' },
              { step: '2', title: 'AI checks your calendar', desc: 'SchedulerAI reads your real Google Calendar availability and finds the perfect slot instantly.' },
              { step: '3', title: 'Invites go out automatically', desc: 'A Google Calendar event is created and all participants receive their invites immediately.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-6 items-start">
                <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center
                  text-white font-bold text-sm shrink-0 shadow-lg shadow-brand-600/30">
                  {step}
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1">{title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { value: '218 hrs', label: 'saved per person per year' },
            { value: '10 sec', label: 'average time to schedule' },
            { value: '0', label: 'back-and-forth emails' },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-4xl font-bold text-brand-400 mb-2">{value}</p>
              <p className="text-slate-400 text-sm">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-10">What teams are saying</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                quote: "I scheduled 8 meetings in the time it used to take me to schedule one. This is genuinely magic.",
                name: 'Priya K.',
                role: 'Product Manager',
              },
              {
                quote: "Finally stopped dreading the scheduling part of my job. I just describe it and it's done.",
                name: 'Marcus T.',
                role: 'Sales Lead',
              },
              {
                quote: "Our team uses it every day. The AI understands context I didn't even know it needed.",
                name: 'Elena R.',
                role: 'Engineering Manager',
              },
            ].map(({ quote, name, role }) => (
              <div key={name} className="card space-y-4">
                <p className="text-slate-300 text-sm leading-relaxed italic">"{quote}"</p>
                <div>
                  <p className="text-white font-semibold text-sm">{name}</p>
                  <p className="text-slate-500 text-xs">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-6 py-20 bg-slate-900/50 border-t border-slate-800">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to stop wasting time on scheduling?
          </h2>
          <p className="text-slate-400 mb-8">
            Join thousands of professionals who schedule meetings in seconds, not minutes.
          </p>
          <button
            onClick={handleGetStarted}
            disabled={loading}
            className="btn-primary px-10 py-4 text-base font-semibold shadow-xl
              shadow-brand-600/25 disabled:opacity-60"
          >
            {loading ? 'Redirecting…' : 'Get started free — no credit card'}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-brand-600 flex items-center justify-center">
              <CalendarIcon className="w-3 h-3 text-white" />
            </div>
            <span className="text-slate-400 text-sm font-medium">SchedulerAI</span>
          </div>
          <div className="flex items-center gap-6 text-slate-600 text-xs">
            <a href="#" className="hover:text-slate-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-400 transition-colors">Terms</a>
            <a href="/pricing" className="hover:text-slate-400 transition-colors">Pricing</a>
          </div>
          <p className="text-slate-600 text-xs">© 2026 SchedulerAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
