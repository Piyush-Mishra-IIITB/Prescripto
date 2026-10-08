import React, { useContext, useState } from "react";
import { assets } from "../assets/assets_frontend/assets";
import { NavLink, useNavigate } from "react-router-dom";
import { AppContext } from "../context/AppContext";

function Navbar() {
  const navigate = useNavigate();
  const { token, setToken, userData } = useContext(AppContext);
  const [showMenu, setShowMenu] = useState(false);

  const logout = () => {
    setToken(false);
    localStorage.removeItem("token");
  };

  const goToDoctorPanel = () => {
    window.location.href = import.meta.env.VITE_DOCTOR_PANEL_URL;
  };

  // Desktop active style
  const navItem = ({ isActive }) =>
    `py-1 transition border-b-2 ${
      isActive
        ? "text-primary border-primary"
        : "text-gray-700 border-transparent hover:text-primary"
    }`;

  // Mobile active style
  const mobileItem = ({ isActive }) =>
    `transition ${isActive ? "text-primary font-semibold" : "text-gray-700"}`;

  return (
    <div className="flex items-center justify-between py-4 px-8 border-b bg-white shadow-sm">
      {/* Logo */}
      <img
        onClick={() => navigate("/")}
        className="w-44 cursor-pointer"
        src={assets.logo}
        alt="logo"
      />

      {/* Desktop Links */}
      <ul className="hidden md:flex items-start gap-6 font-medium">
        <NavLink to="/" end className={navItem}>
          <li>Home</li>
        </NavLink>

        <NavLink to="/doctors" className={navItem}>
          <li>All Doctors</li>
        </NavLink>

        <NavLink to="/ai-consult" className={navItem}>
          <li>AI Recommend</li>
        </NavLink>

        <NavLink to="/medical-assistant" className={navItem}>
          <li>Medical Assistant</li>
        </NavLink>

        <NavLink to="/about" className={navItem}>
          <li>About</li>
        </NavLink>

        <NavLink to="/contact" className={navItem}>
          <li>Contact</li>
        </NavLink>
      </ul>

      {/* Right Side */}
      <div className="flex items-center gap-4">
        {/* Logged In */}
        {token && userData ? (
          <div className="flex items-center gap-2 cursor-pointer relative group">
            <img
              className="w-8 h-8 rounded-full object-cover"
              src={userData.image}
              alt="profile"
            />

            <img
              className="w-2.5 transition-transform duration-200 group-hover:rotate-180"
              src={assets.dropdown_icon}
              alt="dropdown"
            />

            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20">
              <div className="min-w-48 bg-white shadow-xl rounded-lg flex flex-col gap-3 p-4 text-sm text-gray-700">
                <p
                  onClick={() => navigate("/my-profile")}
                  className="hover:text-primary cursor-pointer"
                >
                  My Profile
                </p>

                <p
                  onClick={() => navigate("/my-appointments")}
                  className="hover:text-primary cursor-pointer"
                >
                  My Appointments
                </p>

                <p
                  onClick={logout}
                  className="hover:text-red-500 cursor-pointer"
                >
                  Logout
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Logged Out Buttons */
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => navigate("/login")}
              className="px-8 py-3 rounded-full font-light border border-primary text-primary
                         hover:bg-primary hover:text-white transition-all duration-200"
            >
              Create Account
            </button>

            <button
              onClick={goToDoctorPanel}
              className="px-8 py-3 rounded-full font-light border border-primary text-primary
                         hover:bg-primary hover:text-white transition-all duration-200"
            >
              Doctor / Admin
            </button>
          </div>
        )}

        {/* Mobile Menu Icon */}
        <img
          onClick={() => setShowMenu(true)}
          className="w-6 md:hidden"
          src={assets.menu_icon}
          alt="menu"
        />

        {/* Mobile Sidebar */}
        <div
          className={`fixed top-0 right-0 h-full w-72 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${
            showMenu ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b">
            <img className="w-32" src={assets.logo} alt="logo" />

            <img
              onClick={() => setShowMenu(false)}
              className="w-6 cursor-pointer"
              src={assets.cross_icon}
              alt="close"
            />
          </div>

          {/* Links */}
          <ul className="flex flex-col gap-6 px-8 py-8 text-lg font-medium">
            <NavLink
              onClick={() => setShowMenu(false)}
              to="/"
              end
              className={mobileItem}
            >
              Home
            </NavLink>

            <NavLink
              onClick={() => setShowMenu(false)}
              to="/doctors"
              className={mobileItem}
            >
              All Doctors
            </NavLink>

            <NavLink
              onClick={() => setShowMenu(false)}
              to="/ai-consult"
              className={mobileItem}
            >
              AI Recommend
            </NavLink>

            <NavLink
              onClick={() => setShowMenu(false)}
              to="/medical-assistant"
              className={mobileItem}
            >
              Medical Assistant
            </NavLink>

            <NavLink
              onClick={() => setShowMenu(false)}
              to="/about"
              className={mobileItem}
            >
              About
            </NavLink>

            <NavLink
              onClick={() => setShowMenu(false)}
              to="/contact"
              className={mobileItem}
            >
              Contact
            </NavLink>

            {!token && (
              <>
                <button
                  onClick={() => navigate("/login")}
                  className="mt-4 border border-primary text-primary px-4 py-3 rounded-lg hover:bg-primary hover:text-white transition"
                >
                  Create Account
                </button>

                <button
                  onClick={goToDoctorPanel}
                  className="border border-primary text-primary px-4 py-3 rounded-lg hover:bg-primary hover:text-white transition"
                >
                  Doctor / Admin Login
                </button>
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Navbar;
