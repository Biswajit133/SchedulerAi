import React, { useState, useEffect, useRef } from 'react';
import { ContactAPI } from '../services/api';

export default function MissingFieldForm({ meeting, missingFields, onComplete, onBack }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const [contacts, setContacts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const dropdownRef = useRef(null);

  const current = missingFields[currentIndex];
  const progress = ((currentIndex) / missingFields.length) * 100;

  useEffect(() => {
    setInputValue('');
    setError('');
    setShowDropdown(false);
  }, [currentIndex]);

  // Load contacts once
  useEffect(() => {
    if (!contactsLoaded) {
      ContactAPI.getContacts()
        .then((res) => setContacts(res.contacts || []))
        .catch(() => {})
        .finally(() => setContactsLoaded(true));
    }
  }, [contactsLoaded]);

  // Filter suggestions on email fields
  useEffect(() => {
    if (current?.type !== 'email' || !inputValue.trim() || contacts.length === 0) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const q = inputValue.toLowerCase();
    const filtered = contacts
      .filter((c) => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 6);
    setSuggestions(filtered);
    setShowDropdown(filtered.length > 0);
  }, [inputValue, contacts, current?.type]);

  // Click-outside dismissal
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const validate = (value) => {
    if (!value.trim()) return 'This field is required.';
    if (current.type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return 'Please enter a valid email address.';
      }
    }
    return '';
  };

  const handleNext = () => {
    const err = validate(inputValue);
    if (err) { setError(err); return; }

    const updated = { ...answers, [current.field]: inputValue.trim() };
    setAnswers(updated);

    if (currentIndex + 1 >= missingFields.length) {
      onComplete(updated);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleNext();
    }
  };

  if (!current) return null;

  return (
    <div className="card animate-slide-up max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400">
            Question {currentIndex + 1} of {missingFields.length}
          </span>
          <button onClick={onBack} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
            ← Back
          </button>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5">
          <div
            className="bg-brand-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Meeting context */}
      <div className="mb-5 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
        <p className="text-xs text-slate-500 mb-1">For meeting</p>
        <p className="text-sm font-medium text-white truncate">{meeting.meeting_title}</p>
      </div>

      {/* Question */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <FieldIcon type={current.type} />
          <label className="text-base font-semibold text-white">{current.question}</label>
        </div>

        <div className="relative" ref={dropdownRef}>
          <input
            type={current.type === 'email' ? 'email' : current.type === 'date' ? 'date' : 'text'}
            className={`input ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
            placeholder={getPlaceholder(current.type)}
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            autoFocus
          />
          {showDropdown && (
            <ul className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
              {suggestions.map((c) => (
                <li
                  key={c.email}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInputValue(c.email);
                    setError('');
                    setShowDropdown(false);
                  }}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  <span className="text-sm font-medium text-white truncate">{c.name}</span>
                  <span className="text-xs text-slate-400 ml-2 shrink-0">{c.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

        {current.type === 'duration' && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {['30 min', '1 hour', '1.5 hours', '2 hours'].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setInputValue(opt)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
                  ${inputValue === opt
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {current.type === 'time' && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM', '4:00 PM'].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setInputValue(opt)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
                  ${inputValue === opt
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={handleNext} className="btn-primary w-full">
        {currentIndex + 1 >= missingFields.length ? 'Complete & Continue' : 'Next'}
      </button>
    </div>
  );
}

function FieldIcon({ type }) {
  const icons = {
    email: (
      <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    date: (
      <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    time: (
      <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    duration: (
      <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  return icons[type] || null;
}

function getPlaceholder(type) {
  const map = {
    email: 'name@company.com',
    date: 'e.g. 2025-05-30 or "next Friday"',
    time: 'e.g. 10:00 AM or 14:00',
    duration: 'e.g. 1 hour, 30 min, 90',
  };
  return map[type] || '';
}
