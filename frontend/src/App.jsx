import { Routes, Route, Navigate } from "react-router-dom";
import { useContext } from "react";

import MedicalAssistant from "./pages/MedicalAssistant";
import Home from "./pages/Home";
import Doctor from "./pages/Doctor";
import Login from "./pages/Login";
import About from "./pages/About";
import Contact from "./pages/Contact";
import MyProfile from "./pages/MyProfile";
import MyAppointments from "./pages/MyAppointments";
import Appointments from "./pages/Appointments";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Policy from "./components/Policy";
import AiConsult from "./pages/AiConsult";
import Consultation from "./pages/Consultation";

import "react-toastify/dist/ReactToastify.css";
import { ToastContainer } from "react-toastify";

import { AppContext } from "./context/AppContext";

// Protected route
const ProtectedRoute = ({ children }) => {
  const { token } = useContext(AppContext);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <div>
      <ToastContainer />

      <Navbar />

      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />

        <Route path="/doctors" element={<Doctor />} />

        <Route path="/doctors/:speciality" element={<Doctor />} />

        <Route path="/login" element={<Login />} />

        <Route path="/about" element={<About />} />

        <Route path="/contact" element={<Contact />} />

        <Route path="/Policy" element={<Policy />} />

        {/* AI Recommendation */}
        <Route path="/ai-consult" element={<AiConsult />} />

        {/* Appointment */}
        <Route path="/appointment/:docId" element={<Appointments />} />

        <Route path="/my-appointments" element={<MyAppointments />} />

        <Route path="/consult/:appointmentId" element={<Consultation />} />

        {/* Protected Routes */}
        <Route
          path="/my-profile"
          element={
            <ProtectedRoute>
              <MyProfile />
            </ProtectedRoute>
          }
        />

        {/* Medical Assistant - Login Required */}
        <Route
          path="/medical-assistant"
          element={
            <ProtectedRoute>
              <MedicalAssistant />
            </ProtectedRoute>
          }
        />
      </Routes>

      <Footer />
    </div>
  );
}

export default App;
