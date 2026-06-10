import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { OnboardingWizard } from './pages/OnboardingWizard';
import { Terms } from './pages/Terms';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OnboardingWizard />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>
    </BrowserRouter>
  );
}
