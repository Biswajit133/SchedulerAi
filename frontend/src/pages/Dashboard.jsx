import React, { useState, useEffect } from 'react';
import MeetingInput from '../components/MeetingInput';
import MeetingSummary from '../components/MeetingSummary';
import MissingFieldForm from '../components/MissingFieldForm';
import AvailableSlots from '../components/AvailableSlots';
import ScheduleConfirmation from '../components/ScheduleConfirmation';
import { MeetingAPI, AuthAPI } from '../services/api';

const STEPS = {
  INPUT: 'input',
  SUMMARY: 'summary',
  MISSING: 'missing',
  SLOTS: 'slots',
  CONFIRMING: 'confirming',
  SUCCESS: 'success',
};

export default function Dashboard() {
  const [step, setStep] = useState(STEPS.INPUT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [meetings, setMeetings] = useState([]);
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [missingFields, setMissingFields] = useState([]);

  const [slotData, setSlotData] = useState({ availableSlots: [], busySlots: [], demo: true });
  const [confirmation, setConfirmation] = useState(null);

  const [authStatus, setAuthStatus] = useState({ authenticated: false, checked: false });

  useEffect(() => {
    AuthAPI.getStatus()
      .then((res) => setAuthStatus({ authenticated: res.authenticated, checked: true }))
      .catch(() => setAuthStatus({ authenticated: false, checked: true }));

    // Handle OAuth redirect result
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      setAuthStatus({ authenticated: true, checked: true });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('auth') === 'error') {
      const reason = params.get('reason') || 'unknown error';
      setError(
        `Google Calendar auth failed: ${reason}. ` +
        'Check that your GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and redirect URI are correct in backend/.env, ' +
        'and that http://localhost:3001/api/auth/google/callback is added as an Authorized Redirect URI in Google Cloud Console.'
      );
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const clearError = () => setError(null);

  // ─── Step handlers ────────────────────────────────────────────────────────

  const handleExtract = async (notes) => {
    setLoading(true);
    clearError();
    try {
      const res = await MeetingAPI.extract(notes);
      setMeetings(res.meetings);
      setStep(STEPS.SUMMARY);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMeeting = async (meeting) => {
    setActiveMeeting(meeting);
    if (meeting.missingFields?.length > 0) {
      setMissingFields(meeting.missingFields);
      setStep(STEPS.MISSING);
    } else {
      await loadSlots(meeting);
    }
  };

  const handleMissingComplete = async (answers) => {
    setLoading(true);
    clearError();
    try {
      const res = await MeetingAPI.validate(activeMeeting, answers);
      setActiveMeeting(res.meeting);
      if (res.missingFields?.length > 0) {
        setMissingFields(res.missingFields);
        setStep(STEPS.MISSING);
      } else {
        await loadSlots(res.meeting);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSlots = async (meeting) => {
    setLoading(true);
    clearError();
    try {
      const res = await MeetingAPI.getSlots(meeting.date, meeting.duration);
      setSlotData({ availableSlots: res.availableSlots, busySlots: res.busySlots, demo: res.demo });
      setStep(STEPS.SLOTS);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSlot = async (slot) => {
    setLoading(true);
    clearError();
    try {
      const res = await MeetingAPI.schedule(activeMeeting, slot);
      setConfirmation(res.summary);
      setStep(STEPS.SUCCESS);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(STEPS.INPUT);
    setMeetings([]);
    setActiveMeeting(null);
    setMissingFields([]);
    setSlotData({ availableSlots: [], busySlots: [], demo: true });
    setConfirmation(null);
    clearError();
  };

  const handleGoogleAuth = async () => {
    try {
      const res = await AuthAPI.getGoogleAuthUrl();
      window.location.href = res.url;
    } catch (err) {
      setError('Google OAuth not configured. Add GOOGLE_CLIENT_ID to backend .env');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-bold text-white text-lg">SchedulerAI</span>
          </div>

          <div className="flex items-center gap-3">
            {authStatus.checked && (
              authStatus.authenticated ? (
                <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Google Calendar connected
                </span>
              ) : (
                <button onClick={handleGoogleAuth}
                  className="btn-secondary text-sm py-2 flex items-center gap-2">
                  <GoogleIcon />
                  Connect Calendar
                </button>
              )
            )}
          </div>
        </div>
      </nav>

      {/* Breadcrumb */}
      {step !== STEPS.INPUT && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <StepIndicator step={step} />
        </div>
      )}

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl
            flex items-start justify-between animate-fade-in">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd" />
              </svg>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
            <button onClick={clearError} className="text-red-500 hover:text-red-300 ml-4">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* Step: Input */}
        {step === STEPS.INPUT && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">
                Schedule meetings with{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-purple-400">
                  AI
                </span>
              </h1>
              <p className="text-slate-400 text-lg">
                Paste your meeting notes and let AI handle the scheduling.
              </p>
            </div>
            <MeetingInput onExtract={handleExtract} loading={loading} />
          </div>
        )}

        {/* Step: Summary */}
        {step === STEPS.SUMMARY && (
          <div className="space-y-6">
            <MeetingSummary meetings={meetings} onSelectMeeting={handleSelectMeeting} />
            <button onClick={handleReset} className="btn-secondary text-sm">← Start Over</button>
          </div>
        )}

        {/* Step: Missing fields */}
        {step === STEPS.MISSING && activeMeeting && (
          <MissingFieldForm
            meeting={activeMeeting}
            missingFields={missingFields}
            onComplete={handleMissingComplete}
            onBack={() => setStep(STEPS.SUMMARY)}
          />
        )}

        {/* Step: Slots */}
        {step === STEPS.SLOTS && (
          <AvailableSlots
            meeting={activeMeeting}
            availableSlots={slotData.availableSlots}
            busySlots={slotData.busySlots}
            demo={slotData.demo}
            onSelectSlot={handleSelectSlot}
            onBack={() => setStep(activeMeeting.missingFields?.length > 0 ? STEPS.MISSING : STEPS.SUMMARY)}
            loading={loading}
          />
        )}

        {/* Step: Success */}
        {step === STEPS.SUCCESS && (
          <ScheduleConfirmation summary={confirmation} onScheduleAnother={handleReset} />
        )}
      </main>
    </div>
  );
}

function StepIndicator({ step }) {
  const steps = [
    { key: STEPS.INPUT, label: 'Input' },
    { key: STEPS.SUMMARY, label: 'Review' },
    { key: STEPS.MISSING, label: 'Details' },
    { key: STEPS.SLOTS, label: 'Pick Slot' },
    { key: STEPS.SUCCESS, label: 'Confirmed' },
  ];
  const stepOrder = steps.map((s) => s.key);
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="flex items-center gap-2">
      {steps.slice(1).map((s, i) => {
        const idx = i + 1;
        const done = currentIdx > idx;
        const active = currentIdx === idx;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span className="text-slate-700">›</span>}
            <span className={`text-sm ${active ? 'text-brand-400 font-medium' : done ? 'text-slate-400' : 'text-slate-600'}`}>
              {s.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
