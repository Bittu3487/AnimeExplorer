import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import env from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import LocalStrategy from "passport-local";
import session from "express-session";
import passport from "passport";
import path from "path";
import { fileURLToPath } from "url";
import GoogleStrategy from "passport-google-oauth2";
import crypto from "crypto"
import nodemailer from "nodemailer"

const app = express();
const port = 3000;
const saltRounds = 10;
env.config()
const API_URL = process.env.API_URL;
app.use(session({
  secret:process.env.SECRET,
  resave:false,
  saveUninitialized:false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  },
})
);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ✅ Set EJS as the view engine
app.set('view engine', 'ejs');

// ✅ Set the views directory
app.set('views', path.join(__dirname, 'views'));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();
app.get("/", (req, res) => {
  res.render("home.ejs");
});
app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/index", (req, res) => {
  // console.log(req.user);
  if (req.isAuthenticated()) {
    res.render("index.ejs" , { data: null, currentPage: 1, animeName: '' });
  } else {
    res.redirect("/login");
  }
});
app.get("/about", (req, res) => {
  res.render("about.ejs"); 
});
app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/index",
    failureRedirect: "/login",
  })
);

// app.post("/register", async (req, res) => {
//   const email = req.body.username;
//   const password = req.body.password;

//   try {
//     const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
//       email,
//     ]);

//     if (checkResult.rows.length > 0) {
//       req.redirect("/login");
//     } else {
//       bcrypt.hash(password, saltRounds, async (err, hash) => {
//         if (err) {
//           console.error("Error hashing password:", err);
//         } else {
//           const result = await db.query(
//             "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
//             [email, hash]
//           );
//           const user = result.rows[0];
//           req.login(user, (err) => {
//             console.log("success");
//             res.redirect("/index");
//           });
//         }
//       });
//     }
//   } catch (err) {
//     console.log(err);
//   }
// });

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    // check if email already exists
    const existingUser = await db.query("SELECT * FROM users WHERE email = $1", [username]);

    if (existingUser.rows.length > 0) {
      // user already registered
      return res.render("register.ejs", { error: "Email already registered. Please login." });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // insert new user
    await db.query("INSERT INTO users (email, password) VALUES ($1, $2)", [username, hashedPassword]);

    // redirect to login page after successful signup
    res.redirect("/login");

  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send("Error registering user.");
  }
});

// Passport Local Strategy
passport.use(new LocalStrategy(
  { usernameField: "username", passwordField: "password" },
  async (username, password, done) => {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [username]);
      if (result.rows.length === 0) {
        return done(null, false, { message: "Incorrect username." });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return done(null, false, { message: "Incorrect password." });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Google OAuth Strategy
// Google OAuth Strategy
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback", // ✅ FIXED (port + path)
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [profile.email]);

      if (result.rows.length === 0) {
        const newUser = await db.query(
          "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
          [profile.email, null] // ✅ use null instead of "google"
        );
        return done(null, newUser.rows[0]);
      } else {
        return done(null, result.rows[0]);
      }
    } catch (err) {
      return done(err);
    }
  }
));

// Google Auth routes
app.get("/auth/google",
  passport.authenticate("google", { scope: ["email", "profile"] })
);

// ✅ This must match the callbackURL above
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect("/index"); // successful login
  }
);

// app.get("/auth/google", passport.authenticate("google", {
//   scope: ["email", "profile"]
// }));

// app.get("/auth/google/index", 
//   passport.authenticate("google", { failureRedirect: "/login" }),
//   (req, res) => {
//     // Successful authentication, redirect to your frontend home page
//     res.redirect("http://localhost:3000/index"); // Adjust this URL as necessary
//   }
// );


app.post("/submit", async(req, res) => {
  var animeName = req.body["fName"];
  const currentPage = parseInt(req.body["page"]) || 1;
  
  try {
    var response = await axios.get(`${API_URL}?q=${animeName}&page=${currentPage}`);
    var result = response.data;
    const totalPages = result.pagination.last_visible_page;
    const pageNumbers = [];
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(i);
    }
    res.render("index.ejs" , {
      data:result,
      currentPage: currentPage, // Current page number
      totalPages: totalPages, // Total number of pages
      animeName: animeName, // Keep track of search term
      pageNumbers: pageNumbers // Array of page numbers for pagination
    });
  } catch (error) {
    res.status(404).send(error.message);
    }
  });
app.get("/anime/:id", async (req, res) => {
    var animeId = req.params.id;
    try {
      var response = await axios.get(`${API_URL}${animeId}`);
      var result = response.data;
      res.render("anime-details.ejs", { anime: result.data }); // Render anime details page
    } catch (error) {
      res.status(404).send(error.message);
    }
  });
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return done(new Error("User not found"));
    }
    done(null, result.rows[0]);
  } catch (err) {
    done(err);
  }
});


// // reset password code
// app.get("/forgot-password", (req, res) => {
//   res.render("forgot-password"); // create forgot-password.ejs
// });

// // Handle forgot password
// app.post("/forgot-password", async (req, res) => {
//   const { email } = req.body;

//   try {
//     // Check if user exists
//     const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
//     if (result.rows.length === 0) {
//       return res.send("No account with that email exists.");
//     }

//     // Generate reset token
//     const token = crypto.randomBytes(20).toString("hex");
//     const expires = Date.now() + 3600000; // 1 hour

//     // Save token in DB (add reset_token, reset_expires columns in users table)
//     await db.query(
//       "UPDATE users SET reset_token = $1, reset_expires = $2 WHERE email = $3",
//       [token, expires, email]
//     );

//     // Send email
//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//       },
//     });

//     const resetURL = `http://localhost:3000/reset-password/${token}`;

//     await transporter.sendMail({
//       to: email,
//       from: process.env.EMAIL_USER,
//       subject: "Password Reset",
//       text: `Click the link to reset your password: ${resetURL}`,
//     });

//     res.send("Password reset link sent to your email.");
//   } catch (err) {
//     console.error(err);
//     res.send("Error sending reset link.");
//   }
// });

// // Show reset password form
// app.get("/reset-password/:token", async (req, res) => {
//   const { token } = req.params;

//   try {
//     const result = await db.query(
//       "SELECT * FROM users WHERE reset_token = $1 AND reset_expires > $2",
//       [token, Date.now()]
//     );

//     if (result.rows.length === 0) {
//       return res.send("Password reset token is invalid or expired.");
//     }

//     res.render("reset-password", { token }); // create reset-password.ejs
//   } catch (err) {
//     res.send("Error validating reset token.");
//   }
// });

// // Handle reset password form
// app.post("/reset-password/:token", async (req, res) => {
//   const { token } = req.params;
//   const { password } = req.body;

//   try {
//     const result = await db.query(
//       "SELECT * FROM users WHERE reset_token = $1 AND reset_expires > $2",
//       [token, Date.now()]
//     );

//     if (result.rows.length === 0) {
//       return res.send("Password reset token is invalid or expired.");
//     }

//     const email = result.rows[0].email;

//     // Update password (⚠️ hash it if using bcrypt)
//     await db.query(
//       "UPDATE users SET password = $1, reset_token = NULL, reset_expires = NULL WHERE email = $2",
//       [password, email]
//     );

//     res.send("Password has been reset successfully! You can now login.");
//   } catch (err) {
//     res.send("Error resetting password.");
//   }
// });
// Add anime to favorites
app.post("/favorites/add", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }

  const { animeId, animeTitle, animeImage } = req.body;
  const userId = req.user.id;

  try {
    await db.query(
      "INSERT INTO favorites (user_id, anime_id, anime_title, anime_image) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [userId, animeId, animeTitle, animeImage]
    );
    res.redirect("/favorites");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding favorite");
  }
});

// Show user's favorites
app.get("/favorites", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }

  try {
    const result = await db.query("SELECT * FROM favorites WHERE user_id = $1", [req.user.id]);
    res.render("favorites", { favorites: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading favorites");
  }
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
