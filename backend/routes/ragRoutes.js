import express from "express";
import { ragChat } from "../contollers/ragController.js";
import authUser from "../middlewares/authUser.js";

const ragRouter = express.Router();

ragRouter.post("/chat", authUser, ragChat);

export default ragRouter;
