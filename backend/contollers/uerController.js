import validator from "validator";

import bcrypt from "bcrypt";

import jwt from "jsonwebtoken";

import Razorpay from "razorpay";

import crypto from "crypto";

import mongoose from "mongoose";

import { v2 as cloudinary } from "cloudinary";

import userModel from "../models/userModel.js";

import doctorModel from "../models/doctorModel.js";

import appointmentModel from "../models/appointmentModel.js";

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
   REDIS APPOINTMENT LOCK RELEASE
========================================================= */

/*
  Release the lock only if the token stored in Redis
  belongs to the current booking request.

  Lua makes GET + DEL atomic.
*/

const releaseAppointmentLock = async (lockKey, lockToken) => {
  if (!redisClient.isReady) return;

  try {
    await redisClient.eval(
      `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
      `,
      {
        keys: [lockKey],
        arguments: [lockToken],
      },
    );

    console.log("Appointment lock released");
  } catch (error) {
    console.log("Redis lock release failed:", error.message);
  }
};

/* =========================================================
   RAZORPAY INSTANCE
========================================================= */

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

/* =========================================================
   REGISTER
========================================================= */

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.json({
        success: false,
        message: "Missing details",
      });

    if (!validator.isEmail(email))
      return res.json({
        success: false,
        message: "Enter valid email",
      });

    if (password.length < 8)
      return res.json({
        success: false,
        message: "Password too short",
      });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await userModel.create({
      name,
      email,
      password: hashedPassword,
    });

    const token = jwt.sign(
      {
        id: user._id,
        role: "patient",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   LOGIN
========================================================= */

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email });

    if (!user)
      return res.json({
        success: false,
        message: "User not found",
      });

    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.json({
        success: false,
        message: "Invalid credentials",
      });

    const token = jwt.sign(
      {
        id: user._id,
        role: "patient",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   PROFILE
========================================================= */

const getProfile = async (req, res) => {
  try {
    const userData = await userModel.findById(req.userId).select("-password");

    res.json({
      success: true,
      userData,
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   UPDATE PROFILE
========================================================= */

const updateProfile = async (req, res) => {
  try {
    const { name, phone, address, dob, gender } = req.body;

    await userModel.findByIdAndUpdate(req.userId, {
      name,
      phone,
      address: JSON.parse(address),
      dob,
      gender,
    });

    if (req.file) {
      const upload = await cloudinary.uploader.upload(req.file.path);

      await userModel.findByIdAndUpdate(req.userId, {
        image: upload.secure_url,
      });
    }

    res.json({
      success: true,
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   BOOK APPOINTMENT
========================================================= */

const bookAppointment = async (req, res) => {
  let lockKey = null;
  let lockToken = null;

  try {
    const { docId, slotDate, slotTime } = req.body;

    /* =====================================================
       CHECK REDIS
    ===================================================== */

    /*
      Booking uses Redis as a distributed lock.

      Unlike caching, we fail closed if Redis is unavailable.
      Otherwise two concurrent requests could book the same slot.
    */

    if (!redisClient.isReady) {
      return res.json({
        success: false,
        message: "Booking service temporarily unavailable. Please try again.",
      });
    }

    /* =====================================================
       CREATE LOCK KEY
    ===================================================== */

    /*
      Every doctor + date + time gets its own lock.

      Example:

      lock:appointment:
      65abc...:
      2026-10-05:
      10:30
    */

    lockKey = `lock:appointment:${docId}:${slotDate}:${slotTime}`;

    /*
      Unique token identifies this particular booking request.
    */

    lockToken = crypto.randomUUID();

    /* =====================================================
       ACQUIRE DISTRIBUTED LOCK
    ===================================================== */

    const lockAcquired = await redisClient.set(lockKey, lockToken, {
      NX: true,
      EX: 15,
    });

    /*
      NX:
      Create the key only if it does not already exist.

      EX:
      Automatically expire the lock after 15 seconds.
    */

    if (lockAcquired !== "OK") {
      return res.json({
        success: false,
        message: "Slot is currently being booked. Please try again.",
      });
    }

    console.log("Appointment lock acquired:", lockKey);

    /* =====================================================
       GET DOCTOR
    ===================================================== */

    const doctor = await doctorModel.findById(docId).select("-password");

    if (!doctor || doctor.available === false) {
      return res.json({
        success: false,
        message: "Doctor not available",
      });
    }

    /* =====================================================
       CHECK SLOT
    ===================================================== */

    let slots = doctor.slots_booked || {};

    if (slots[slotDate]?.includes(slotTime)) {
      return res.json({
        success: false,
        message: "Slot not available",
      });
    }

    /* =====================================================
       ADD SLOT
    ===================================================== */

    slots[slotDate] = slots[slotDate] || [];

    slots[slotDate].push(slotTime);

    /* =====================================================
       CREATE APPOINTMENT
    ===================================================== */

    const appointment = await appointmentModel.create({
      userId: new mongoose.Types.ObjectId(req.userId),

      docId: new mongoose.Types.ObjectId(docId),

      userData: await userModel.findById(req.userId).select("-password"),

      docData: {
        ...doctor.toObject(),
        slots_booked: undefined,
      },

      amount: doctor.fees || doctor.fee || 500,

      slotDate,

      slotTime,

      date: Date.now(),

      payment: false,

      appointmentStatus: "pending",
    });

    /* =====================================================
       UPDATE DOCTOR SLOT
    ===================================================== */

    await doctorModel.findByIdAndUpdate(docId, {
      slots_booked: slots,
    });

    /* =====================================================
       INVALIDATE DOCTOR CACHE
    ===================================================== */

    await invalidateDoctorListCache();

    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.json({
      success: true,
      appointment,
    });
  } catch (error) {
    console.log("Book appointment error:", error);

    return res.json({
      success: false,
      message: error.message,
    });
  } finally {
    /* =====================================================
       RELEASE LOCK
    ===================================================== */

    if (lockKey && lockToken) {
      await releaseAppointmentLock(lockKey, lockToken);
    }
  }
};

/* =========================================================
   LIST APPOINTMENTS
========================================================= */

const listAppointment = async (req, res) => {
  try {
    const appointments = await appointmentModel.find({
      userId: new mongoose.Types.ObjectId(req.userId),
    });

    res.json({
      success: true,
      appointments,
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   CANCEL APPOINTMENT
========================================================= */

const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.body;

    /* =====================================================
       FIND APPOINTMENT
    ===================================================== */

    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment)
      return res.json({
        success: false,
        message: "Appointment not found",
      });

    /* =====================================================
       CHECK PAYMENT
    ===================================================== */

    if (appointment.payment === true)
      return res.json({
        success: false,
        message: "You cannot cancel a paid appointment",
      });

    /* =====================================================
       CANCEL APPOINTMENT
    ===================================================== */

    appointment.cancelled = true;

    appointment.appointmentStatus = "cancelled";

    await appointment.save();

    /* =====================================================
       FREE DOCTOR SLOT
    ===================================================== */

    const doctor = await doctorModel.findById(appointment.docId);

    if (doctor?.slots_booked?.[appointment.slotDate]) {
      doctor.slots_booked[appointment.slotDate] = doctor.slots_booked[
        appointment.slotDate
      ].filter((t) => t !== appointment.slotTime);

      await doctor.save();

      /* ===================================================
         INVALIDATE CACHE
      =================================================== */

      await invalidateDoctorListCache();
    }

    res.json({
      success: true,
      message: "Appointment cancelled",
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   CREATE ORDER
========================================================= */

const paymentRazorpay = async (req, res) => {
  try {
    const { appointmentId } = req.body;

    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment || appointment.cancelled)
      return res.json({
        success: false,
        message: "Invalid appointment",
      });

    const order = await razorpayInstance.orders.create({
      amount: appointment.amount * 100,

      currency: "INR",

      receipt: appointmentId,
    });

    res.json({
      success: true,
      order,
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================================================
   VERIFY PAYMENT
========================================================= */

const verifyRazorpay = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature)
      return res.json({
        success: false,
        message: "Payment verification failed",
      });

    const order = await razorpayInstance.orders.fetch(razorpay_order_id);

    await appointmentModel.findByIdAndUpdate(order.receipt, {
      payment: true,
      appointmentStatus: "paid",
    });

    res.json({
      success: true,
    });
  } catch (error) {
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
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  bookAppointment,
  listAppointment,
  cancelAppointment,
  paymentRazorpay,
  verifyRazorpay,
};
