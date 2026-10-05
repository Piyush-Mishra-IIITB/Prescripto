import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import messageModel from "../models/messageModel.js";
import { redisClient } from "../config/redis.js";

/* =========================================================
   REDIS CACHE INVALIDATION
========================================================= */

const invalidateDoctorListCache = async () => {
  if (!redisClient.isReady) return;

  try {
    await redisClient.del("doctors:list");
    console.log("Doctor list cache invalidated");
  } catch (error) {
    console.log("Redis DEL failed:", error.message);
  }
};

/* =========================================================
   CHANGE AVAILABILITY
========================================================= */

const changeAvailability = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await doctorModel.findById(id);

    if (!doctor)
      return res.json({
        success: false,
        message: "Doctor not found",
      });

    doctor.available = !doctor.available;

    await doctor.save();

    // Doctor availability changed
    await invalidateDoctorListCache();

    res.json({
      success: true,
      message: "Availability updated",
      available: doctor.available,
    });
  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: "Error updating availability",
    });
  }
};

/* =========================================================
   GET ALL DOCTORS (PUBLIC)
========================================================= */

const doctorList = async (req, res) => {
  const cacheKey = "doctors:list";

  try {
    // ================= REDIS CACHE =================

    let cachedDoctors = null;

    if (redisClient.isReady) {
      try {
        cachedDoctors = await redisClient.get(cacheKey);
      } catch (redisError) {
        console.log("Redis GET failed:", redisError.message);
      }
    }

    // ================= CACHE HIT =================

    if (cachedDoctors) {
      console.log("Redis Cache HIT:", cacheKey);

      return res.json({
        success: true,
        doctors: JSON.parse(cachedDoctors),
      });
    }

    console.log("Redis Cache MISS:", cacheKey);

    // ================= MONGODB =================

    const doctors = await doctorModel
      .find({})
      .select("-password -email")
      .lean();

    // ================= REDIS CACHE SET =================

    if (redisClient.isReady) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(doctors), {
          EX: 600,
        });

        console.log("Doctors cached in Redis");
      } catch (redisError) {
        console.log("Redis SET failed:", redisError.message);
      }
    }

    // ================= RESPONSE =================

    return res.json({
      success: true,
      doctors,
    });
  } catch (error) {
    console.log("Doctor list error:", error.message);

    return res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   DOCTOR LOGIN
========================================================= */

const loginDoctor = async (req, res) => {
  try {
    const { email, password } = req.body;

    const doctor = await doctorModel.findOne({ email });

    if (!doctor)
      return res.json({
        success: false,
        message: "Invalid email",
      });

    const isMatch = await bcrypt.compare(password, doctor.password);

    if (!isMatch)
      return res.json({
        success: false,
        message: "Invalid password",
      });

    const token = jwt.sign(
      {
        id: doctor._id,
        role: "doctor",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    res.json({
      success: true,
      token,
      doctor: {
        _id: doctor._id,
        name: doctor.name,
        email: doctor.email,
      },
    });
  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   GET DOCTOR APPOINTMENTS
========================================================= */

const appointmentsDoctor = async (req, res) => {
  try {
    const docId = new mongoose.Types.ObjectId(req.docId);

    const appointments = await appointmentModel
      .find({ docId })
      .populate("userId", "name image dob")
      .select(
        "_id userId slotDate slotTime amount payment cancelled isCompleted doctorUnreadCount lastMessage lastMessageAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    // normalize response for frontend

    const normalized = appointments.map((appt) => ({
      ...appt,

      // frontend expects userData

      userData: appt.userId
        ? {
            name: appt.userId.name,
            image: appt.userId.image,
            dob: appt.userId.dob,
          }
        : {
            name: "Unknown",
            image: "",
          },

      // optional: remove raw mongo object
      // and return only user id

      userId: appt.userId?._id || appt.userId,
    }));

    res.json({
      success: true,
      appointments: normalized,
    });
  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   COMPLETE APPOINTMENT
========================================================= */

const appointmentComplete = async (req, res) => {
  try {
    const docId = new mongoose.Types.ObjectId(req.docId);
    const { appointmentId } = req.body;

    const appointment = await appointmentModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(appointmentId),
        docId,
        cancelled: false,
        isCompleted: false,
      },
      {
        $set: {
          isCompleted: true,
        },
      },
      {
        new: true,
      },
    );

    if (!appointment)
      return res.json({
        success: false,
        message: "Cannot complete cancelled/invalid appointment",
      });

    res.json({
      success: true,
      message: "Appointment completed",
    });
  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   CANCEL APPOINTMENT
========================================================= */

const appointmentCancel = async (req, res) => {
  try {
    const docId = new mongoose.Types.ObjectId(req.docId);
    const { appointmentId } = req.body;

    const appointment = await appointmentModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(appointmentId),
        docId,
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

    if (!appointment)
      return res.json({
        success: false,
        message: "Cannot cancel paid/completed appointment",
      });

    // ================= FREE SLOT =================

    const doctor = await doctorModel.findById(docId);

    if (doctor?.slots_booked?.[appointment.slotDate]) {
      doctor.slots_booked[appointment.slotDate] = doctor.slots_booked[
        appointment.slotDate
      ].filter((t) => t !== appointment.slotTime);

      await doctor.save();

      // Doctor slots changed
      await invalidateDoctorListCache();
    }

    res.json({
      success: true,
      message: "Appointment cancelled",
    });
  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   DOCTOR DASHBOARD
========================================================= */

const doctorDashboard = async (req, res) => {
  try {
    const docId = new mongoose.Types.ObjectId(req.docId);

    const appointments = await appointmentModel.find({ docId }).lean();

    let earnings = 0;
    const patients = new Set();

    appointments.forEach((item) => {
      if (item.isCompleted || item.payment) earnings += item.amount;

      if (item.userId) patients.add(item.userId.toString());
    });

    const dashData = {
      earnings,
      appointments: appointments.length,
      patients: patients.size,

      latestAppointments: appointments
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5),
    };

    res.json({
      success: true,
      dashData,
    });
  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   GET DOCTOR PROFILE
========================================================= */

const doctorProfile = async (req, res) => {
  try {
    const docId = req.docId;

    const profileData = await doctorModel.findById(docId).select("-password");

    if (!profileData)
      return res.json({
        success: false,
        message: "Profile not found",
      });

    res.json({
      success: true,
      profileData,
    });
  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   UPDATE DOCTOR PROFILE
========================================================= */

const updateDoctorPeofile = async (req, res) => {
  try {
    const docId = req.docId;

    const { fees, address, available } = req.body;

    await doctorModel.findByIdAndUpdate(docId, {
      fees,
      address,
      available,
    });

    // Doctor profile changed
    await invalidateDoctorListCache();

    res.json({
      success: true,
      message: "Profile updated",
    });
  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   GET DOCTOR UNREAD CHATS
========================================================= */

const getUnreadChats = async (req, res) => {
  try {
    const doctorId = new mongoose.Types.ObjectId(req.docId);

    const appointments = await appointmentModel
      .find({
        docId: doctorId,
        cancelled: false,
        doctorUnreadCount: { $gt: 0 },
      })
      .sort({ updatedAt: -1 })
      .lean();

    const conversations = appointments.map((appt) => {
      let slotLabel = "";

      if (appt.slotDate && appt.slotTime) {
        const parts = appt.slotDate.split("_");

        const months = [
          "",
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];

        slotLabel = `${parts[0]} ${months[Number(parts[1])]} | ${appt.slotTime}`;
      }

      return {
        appointmentId: appt._id,

        patientName: appt.userData?.name || appt.userId?.name || "Patient",

        patientImage: appt.userData?.image || null,

        lastMessage: appt.lastMessage || "New message",

        lastMessageTime: appt.lastMessageAt || appt.updatedAt,

        unreadCount: appt.doctorUnreadCount || 0,

        slotLabel,
      };
    });

    const totalUnread = conversations.reduce(
      (sum, c) => sum + c.unreadCount,
      0,
    );

    res.json({
      success: true,
      totalUnread,
      conversations,
    });
  } catch (error) {
    console.log("Unread chat error:", error);

    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   MARK CHAT AS READ
========================================================= */

const markChatAsRead = async (req, res) => {
  try {
    const doctorId = new mongoose.Types.ObjectId(req.docId);

    const appointmentId = new mongoose.Types.ObjectId(req.body.appointmentId);

    const appt = await appointmentModel.findOne({
      _id: appointmentId,
      docId: doctorId,
    });

    if (!appt)
      return res.json({
        success: false,
        message: "Appointment not found",
      });

    // reset unread counter

    appt.doctorUnreadCount = 0;

    await appt.save();

    // mark all patient messages as seen

    await messageModel.updateMany(
      {
        appointmentId: appointmentId,
        sender: "patient",
        seen: false,
      },
      {
        $set: {
          seen: true,
        },
      },
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.log("mark read error:", error);

    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

export {
  changeAvailability,
  doctorList,
  loginDoctor,
  appointmentsDoctor,
  appointmentComplete,
  appointmentCancel,
  doctorDashboard,
  updateDoctorPeofile,
  doctorProfile,
  getUnreadChats,
  markChatAsRead,
};
