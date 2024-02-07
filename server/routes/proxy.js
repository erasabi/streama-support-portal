let express = require("express")
let router = express.Router()
const axios = require("axios")
const cheerio = require("cheerio")

async function getYifySubtitleUrl(imdbCode) {
	try {
		// Construct the URL to fetch subtitles based on IMDB code.
		const url = `https://yifysubtitles.ch/movie-imdb/${imdbCode}`

		// Fetch HTML content of the URL.
		const { data: html } = await axios.get(url)

		// Load HTML content into Cheerio for easy DOM manipulation.
		const $ = cheerio.load(html)

		// Find all table rows containing English subtitles.
		const engElement = $("tr").filter(function () {
			return $(this).find("span.sub-lang").text().trim() === "English"
		})

		// Object to store ratings and corresponding subtitle URLs.
		const listEng = {}

		// Iterate over each English subtitle row.
		engElement.each(function () {
			try {
				// Extract rating and subtitle URL from the row.
				const rating = $(this).find("span.label").text().trim()
				const href = $(this).find('a[href^="/subtitles/"]').attr("href")

				// Store rating and URL in the list.
				listEng[rating] = href
			} catch (error) {
				console.log(error) // Log any errors during extraction.
			}
		})

		// Find the top-rated English subtitle URL.
		const topRated = Object.keys(listEng).reduce((a, b) =>
			a > b ? listEng[a] : listEng[b]
		)

		// Extract filename from the subtitle URL.
		const filename = topRated.substring("/subtitles/".length)

		// Construct download URL for the subtitle.
		const dwnUrl = "https://yifysubtitles.ch/subtitle/" + filename + ".zip"

		return dwnUrl // Return the download URL.
	} catch (error) {
		console.log(error) // Log any errors during the process.
	}
}

// Route to handle GET request for subtitle URL based on IMDB code.
router.get("/subtitle-url/:imdbCode", async function (req, res) {
	try {
		// Call getYifySubtitleUrl function to get subtitle URL.
		const url = await getYifySubtitleUrl(req.params.imdbCode)

		// Send subtitle URL as response.
		res.status(200).send(url)
	} catch (error) {
		// If an error occurs, send error message as response.
		res.status(500).send(JSON.stringify(error))
	}
})

module.exports = router
