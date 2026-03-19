import axios from "axios";
import Doctor from "../models/doctorModel.js";

/**
 * Call ML server with retry (handles Render cold start)
 */
const callML = async (symptoms) => {
  const base = process.env.ML_API_URL?.replace(/\/$/, "");
   console.log(base);
  if (!base) {
    throw new Error("ML_API_URL not configured");
  }

  const url = `${base}/predict`;
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await axios.post(
        url,
        { symptoms },
        { timeout: 60000 }
      );

      // ⭐ correct key
      if (!res.data || !res.data.recommended_specialist) {
        throw new Error("Invalid ML response format");
      }

      return res.data.recommended_specialist;

    } catch (err) {
      lastError = err;
      console.log(`ML attempt ${attempt} failed →`, err.code || err.message);
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  throw lastError;
};


/**
 * Recommend doctors using ML specialization
 */export const recommendDoctor = async (req, res) => {
  try {
    let { symptoms } = req.body;

    if (!Array.isArray(symptoms) || symptoms.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No symptoms provided"
      });
    }

    // 🧠 sanitize symptoms before ML
    symptoms = symptoms.map(s =>
      String(s).trim().toLowerCase()
    );

    console.log("Cleaned Symptoms:", symptoms);

    // ML prediction
    const specialist = await callML(symptoms);
    console.log("Predicted specialist:", specialist);

    // DB search
    const doctors = await Doctor.find({
      speciality: { $regex: new RegExp(`^${specialist}$`, "i") }
    }).limit(5);

    return res.json({
      success: true,
      specialist,
      doctors
    });

  } catch (error) {

    console.log("========== AI FAILURE ==========");
    console.log("Code:", error.code);
    console.log("Message:", error.message);
    console.log("Response:", error.response?.data);
    console.log("================================");

    return res.status(500).json({
      success: false,
      message: "AI service unavailable. Please try again in a few seconds."
    });
  }
};
