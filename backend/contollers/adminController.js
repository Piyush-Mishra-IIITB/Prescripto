import validator from "validator";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import doctorModel from "../models/doctorModel.js";
import jwt from "jsonwebtoken";
import appointmentModel from "../models/appointmentModel.js";
import userModel from "../models/userModel.js";
import { redisClient } from "../config/redis.js";

/* ================= REDIS CACHE INVALIDATION ================= */

const invalidateDoctorListCache = async () => {
  if (!redisClient.isReady) return;

  try {
    await redisClient.del("doctors:list");
    console.log("Doctor list cache invalidated");
  } catch (error) {
    console.log("Redis DEL failed:", error.message);
  }
};

/* ================= ADD DOCTOR ================= */

const addDoctor = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      speciality,
      degree,
      experience,
      about,
      fees,
      address,
    } = req.body;

    const imageFile = req.file;

    if (
      !name ||
      !email ||
      !password ||
      !speciality ||
      !degree ||
      !experience ||
      !about ||
      !fees ||
      !address
    ) {
      return res.json({
        success: false,
        message: "Missing details",
      });
    }

    if (!validator.isEmail(email)) {
      return res.json({
        success: false,
        message: "Invalid email",
      });
    }

    if (password.length < 8) {
      return res.json({
        success: false,
        message: "Password must be 8+ chars",
      });
    }

    if (!imageFile) {
      return res.json({
        success: false,
        message: "Doctor image required",
      });
    }

    // check duplicate doctor
    const exists = await doctorModel.findOne({ email });

    if (exists) {
      return res.json({
        success: false,
        message: "Doctor already exists",
      });
    }

    const hashedPass = await bcrypt.hash(password, 10);

    const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
      resource_type: "image",
    });

    const doctorData = {
      name,
      email,
      image: imageUpload.secure_url,
      password: hashedPass,
      speciality,
      degree,
      experience,
      about,
      fees,
      address: JSON.parse(address),
      date: Date.now(),
    };

    // Create doctor in MongoDB
    await doctorModel.create(doctorData);

    // Doctor list cache is now outdated
    await invalidateDoctorListCache();

    return res.json({
      success: true,
      message: "Doctor added successfully",
    });
  } catch (error) {
    console.log(error);

    return res.json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= ADMIN LOGIN ================= */

const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      email !== process.env.ADMIN_EMAIL ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return res.json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        role: "admin",
        email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    return res.json({
      success: true,
      token,
    });
  } catch (error) {
    console.log(error);

    return res.json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= GET ALL DOCTORS ================= */

const allDoctor = async (req, res) => {
  try {
    const doctors = await doctorModel.find({}).select("-password").lean();

    return res.json({
      success: true,
      doctors,
    });
  } catch (error) {
    console.log(error);

    return res.json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= GET ALL APPOINTMENTS ================= */

const appointmentAdmin = async (req, res) => {
  try {
    const appointments = await appointmentModel
      .find({})
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      appointments,
    });
  } catch (error) {
    console.log(error);

    return res.json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= CANCEL APPOINTMENT (SAFE) ================= */

const appointmentCancel = async (req, res) => {
  try {
    const { appointmentId } = req.body;

    // atomic guarded cancel
    const appointment = await appointmentModel.findOneAndUpdate(
      {
        _id: appointmentId,
        cancelled: false,
        isCompleted: false,
        payment: false,
      },
      {
        $set: {
          cancelled: true,
        },
      },
      {
        new: true,
      },
    );

    if (!appointment) {
      return res.json({
        success: false,
        message: "Cannot cancel paid/completed appointment",
      });
    }

    // release doctor slot
    const doctor = await doctorModel.findById(appointment.docId);

    if (doctor?.slots_booked?.[appointment.slotDate]) {
      doctor.slots_booked[appointment.slotDate] = doctor.slots_booked[
        appointment.slotDate
      ].filter((t) => t !== appointment.slotTime);

      await doctor.save();

      // Doctor's slots changed,
      // so cached doctor list is outdated
      await invalidateDoctorListCache();
    }

    return res.json({
      success: true,
      message: "Appointment cancelled",
    });
  } catch (error) {
    console.log(error);

    return res.json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= ADMIN DASHBOARD ================= */

const adminDashboard = async (req, res) => {
  try {
    const [doctors, patients, appointments, latestAppointment] =
      await Promise.all([
        doctorModel.countDocuments(),
        userModel.countDocuments(),
        appointmentModel.countDocuments(),
        appointmentModel.find({}).sort({ createdAt: -1 }).limit(5).lean(),
      ]);

    const dashData = {
      doctors,
      patients,
      appointments,
      latestAppointment,
    };

    return res.json({
      success: true,
      dashData,
    });
  } catch (error) {
    console.log(error);

    return res.json({
      success: false,
      message: error.message,
    });
  }
};

export {
  addDoctor,
  loginAdmin,
  allDoctor,
  appointmentAdmin,
  appointmentCancel,
  adminDashboard,
};
