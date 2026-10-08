import { createContext, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";

export const AppContext = createContext();

// Check whether JWT exists and is not expired
const getValidToken = () => {
  const storedToken = localStorage.getItem("token");

  if (!storedToken) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(storedToken.split(".")[1]));

    // JWT exp is in seconds
    const currentTime = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < currentTime) {
      console.log("Token expired. Removing token.");

      localStorage.removeItem("token");

      return null;
    }

    return storedToken;
  } catch (error) {
    console.log("Invalid token. Removing token.");

    localStorage.removeItem("token");

    return null;
  }
};

const AppContextProvider = (props) => {
  const backendURL = import.meta.env.VITE_BACKEND_URL;

  console.log("BACKEND URL FROM ENV:", backendURL);

  const currencySymbol = "$";

  const [doctors, setDoctors] = useState([]);

  const [userData, setUserData] = useState(false);

  // Validate token when application starts
  const [token, setToken] = useState(() => getValidToken());

  const getDoctorsData = async () => {
    try {
      const { data } = await axios.get(backendURL + "/api/doctor/list");

      if (data.success) {
        setDoctors(data.doctors);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  useEffect(() => {
    getDoctorsData();
  }, []);

  // Keep localStorage synchronized with token
  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }, [token]);

  const loadUserProfileData = async () => {
    try {
      const { data } = await axios.get(backendURL + "/api/user/get-profile", {
        headers: {
          token: token,
        },
      });

      if (data.success) {
        setUserData(data.userData);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log(error);

      // If backend says token is invalid/expired
      if (
        error.response &&
        (error.response.status === 401 || error.response.status === 403)
      ) {
        console.log("Authentication expired. Logging out.");

        setToken(null);
        setUserData(false);

        localStorage.removeItem("token");

        toast.error("Session expired. Please login again.");
      } else {
        toast.error(error.message);
      }
    }
  };

  useEffect(() => {
    if (token) {
      loadUserProfileData();
    } else {
      setUserData(false);
    }
  }, [token]);

  const value = {
    doctors,
    currencySymbol,
    token,
    setToken,
    backendURL,
    userData,
    setUserData,
    loadUserProfileData,
    getDoctorsData,
  };

  return (
    <AppContext.Provider value={value}>{props.children}</AppContext.Provider>
  );
};

export default AppContextProvider;
