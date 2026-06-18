import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import LandingPage from './pages/LandingPage';
import AdminSettings from './pages/AdminSettings';
import UserSettings from './pages/UserSettings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="/settings" element={<UserSettings />} />
        <Route path="/admin" element={<AdminSettings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
