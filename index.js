if (process.env.NODE_ENV != "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const cors = require("cors");

const flash = require("connect-flash");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");
const { Server } = require("http");
const Listing = require("./models/listing.js");

const dbUrl = process.env.ATLAS_URL;

async function main() {
  try {
    await mongoose.connect(dbUrl);
    console.log("connected to DB");
  } catch (err) {
    console.error("Database connection error:", err);
  }
}

main();

app.use(express.json());
app.use(cors());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: process.env.SECRET,
  },
  touchAfter: 24 * 3600,
});

store.on("error", (err) => {
  console.error("ERROR in MONGO SESSION STORE", err);
});

const sessionOptions = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
};

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);

app.get("/chat", (req, res) => {
  res.render("chat");
});

app.post("/chat", async (req, res) => {
  console.log("Received message:", req.body.message);
  const userMessage = req.body.message;

  const googleApiKey = process.env.GOOGLE_API_KEY;
  const model = new ChatGoogleGenerativeAI({
    model: "models/gemini-flash-latest",
    maxOutputTokens: 2048,
    apiKey: googleApiKey,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `Welcome to NavifyAI – your friendly and expert guide to discovering amazing short-term stays and unique homes around the world! 🏡🌍
          
      Please note:
      - I only provide information related to booking, finding, and enjoying short-term rental stays through Navify.
      - I do NOT answer questions unrelated to accommodations, travel bookings, or local stay experiences.
      - I follow Navify's community guidelines: respect privacy, promote safety, and encourage responsible travel.
      - For any inquiries outside of Navify's scope, I will politely redirect you to official support channels.
      
      How can I assist you with your next stay today?`,
    ],
    ["human", userMessage],
  ]);

  try {
    const chain = prompt.pipe(model);
    const response = await chain.invoke({ input: userMessage });
    console.log("response", response.content);
    res.json({ message: response.content });
  } catch (error) {
    console.error("Error fetching AI response:", error);
    res.json({
      message:
        "Sorry, I'm having trouble understanding that. Can you try asking in a different way?",
    });
  }
});

app.get("/Privacy", (req, res) => {
  res.render("listings/privacy");
});
app.get("/Terms", (req, res) => {
  res.render("listings/terms");
});

app.use((err, req, res, next) => {
  const { statusCode = 500, message = "Something went wrong" } = err;
  res.status(statusCode).send(message);
});

app.listen(8080, () => {
  console.log("server is listening to port 8080");
});

app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page not found!!"));
});
