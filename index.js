import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
const port = 3000;
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.get("/", (req, res) => {
  res.render("index.ejs",{ data: null, currentPage: 1, animeName: '' });
});
app.post("/submit", async(req, res) => {
  var animeName = req.body["fName"];
  const currentPage = parseInt(req.body["page"]) || 1;
  
  try {
    var response = await axios.get(`https://api.jikan.moe/v4/anime?q=${animeName}&page=${currentPage}`);
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
      var response = await axios.get(`https://api.jikan.moe/v4/anime/${animeId}`);
      var result = response.data;
      res.render("anime-details.ejs", { anime: result.data }); // Render anime details page
    } catch (error) {
      res.status(404).send(error.message);
    }
  });
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
