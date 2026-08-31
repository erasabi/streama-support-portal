let createError = require("http-errors")
let express = require("express")
let path = require("path")
let cookieParser = require("cookie-parser")
let logger = require("morgan")
// import the library to allow CORS:
let cors = require("cors")

let indexRouter = require("./routes/index")

let requestsRouter = require("./routes/requests")
let proxyRouter = require("./routes/proxy")
let agentRouter = require("./routes/agent")
let adminRouter = require("./routes/admin")

let db = require("./database")
let poller = require("./services/poller")
const { DataTypes } = require("sequelize")

let app = express()

// view engine setup
app.set("views", path.join(__dirname, "views"))
app.set("view engine", "pug")

app.use(logger("dev"))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, "public")))

// Use CORS module before routes are set up, to allow CORS:
app.use(cors())

app.use("/", indexRouter)
app.use("/requests", requestsRouter)
app.use("/proxy", proxyRouter)
app.use("/agent", agentRouter)
app.use("/admin", adminRouter)

// Ensure new tables (PipelineJobs, RequestEvents) exist and start the in-process
// poller (hourly magnet sweep + lease reaper). Column additions to the existing
// Requests table are handled by migrations; sync() only creates missing tables.
async function ensurePipelineJobSeasonsColumn() {
	const qi = db.sequelize.getQueryInterface()
	const table = await qi.describeTable("PipelineJobs")
	if (!table.seasons) {
		await qi.addColumn("PipelineJobs", "seasons", {
			type: DataTypes.JSONB,
			allowNull: true,
		})
	}
}

async function ensureRequestPendingSeasonsColumn() {
	const qi = db.sequelize.getQueryInterface()
	const table = await qi.describeTable("Requests")
	if (!table.pendingSeasons) {
		await qi.addColumn("Requests", "pendingSeasons", {
			type: DataTypes.JSONB,
			allowNull: true,
		})
	}
}

db.sequelize
	.sync()
	.then(() => ensurePipelineJobSeasonsColumn())
	.then(() => ensureRequestPendingSeasonsColumn())
	.then(() => {
		poller.start()
	})
	.catch((err) => {
		console.error("startup sync failed:", err.message)
	})

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	console.log("404")
	next(createError(404))
})

// error handler
app.use(function (err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message
	res.locals.error = req.app.get("env") === "development" ? err : {}

	// render the error page
	res.status(err.status || 500)
	res.render("error")
})

module.exports = app
