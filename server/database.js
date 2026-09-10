const Sequelize = require("sequelize")
const sequelize = new Sequelize(
	process.env.DB_SCHEMA || "postgres",
	process.env.DB_USER || "postgres",
	process.env.DB_PASSWORD || "postgres",
	{
		host: process.env.DB_HOST || "127.0.0.1",
		port: process.env.DB_PORT || 5432,
		dialect: "postgres",
		logging: false,
		dialectOptions: {
			ssl: process.env.DB_SSL == "true",
		},
	}
)

// User-facing request row. `id` is the TMDB id (movie/show) for pipeline
// requests, or a namespaced id (e.g. "update:{tmdb}:{ts}") for update/issue
// rows so they never collide with the pipeline request PK.
const Request = sequelize.define("Request", {
	id: {
		type: Sequelize.STRING,
		primaryKey: true,
		allowNull: false,
	},
	title: {
		type: Sequelize.STRING,
		allowNull: false,
	},
	posterPath: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	originalTitle: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	releaseDate: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	adult: {
		type: Sequelize.BOOLEAN,
		allowNull: true,
	},
	mediaType: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	queueStatus: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	queueMessage: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	// Legacy column kept for backward compatibility. History now lives in the
	// append-only RequestEvents table; do not write to this on update.
	queueEvents: {
		type: Sequelize.ARRAY(Sequelize.JSONB),
		allowNull: true,
	},
	requestUser: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	// --- Magnet / source tracking (movies auto, TV via admin attach) ---
	imdbId: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	magnetUrl: {
		type: Sequelize.TEXT,
		allowNull: true,
	},
	// All sources attached to this request (movies auto, TV/admin manual).
	// magnetUrl mirrors the first/canonical entry for agent GET /jobs.
	magnetUrls: {
		type: Sequelize.JSONB,
		allowNull: true,
	},
	magnetHash: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	magnetQuality: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	subtitleUrl: {
		type: Sequelize.TEXT,
		allowNull: true,
	},
	// pending | found | not_found | not_applicable | error | stopped
	magnetLookupStatus: {
		type: Sequelize.STRING,
		allowNull: true,
		defaultValue: "pending",
	},
	magnetLookedUpAt: {
		type: Sequelize.DATE,
		allowNull: true,
	},
	magnetFoundAt: {
		type: Sequelize.DATE,
		allowNull: true,
	},
	// --- Pipeline progress (denormalized latest stage for the grid) ---
	pipelineStage: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	pipelineStageDetail: {
		type: Sequelize.JSONB,
		allowNull: true,
	},
	// Unioned download/encode/upload file inventories (merged from agent posts).
	pipelineArtifacts: {
		type: Sequelize.JSONB,
		allowNull: true,
	},
	// derived | admin
	queueStatusSource: {
		type: Sequelize.STRING,
		allowNull: true,
		defaultValue: "derived",
	},
	// --- Streama / highlights ---
	streamaMediaId: {
		type: Sequelize.INTEGER,
		allowNull: true,
	},
	streamaVideoId: {
		type: Sequelize.INTEGER,
		allowNull: true,
	},
	highlightedAt: {
		type: Sequelize.DATE,
		allowNull: true,
	},
	// Gap TV seasons waiting for an admin to pick all or a subset.
	pendingSeasons: {
		type: Sequelize.JSONB,
		allowNull: true,
	},
	// Soft-delete: requested media is never hard-deleted.
	archivedAt: {
		type: Sequelize.DATE,
		allowNull: true,
	},
})

// One request can have many pipeline jobs (TV seasons, retries, extra sources).
const PipelineJob = sequelize.define("PipelineJob", {
	id: {
		type: Sequelize.UUID,
		primaryKey: true,
		defaultValue: Sequelize.UUIDV4,
	},
	requestId: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	mediaType: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	sourceUrl: {
		type: Sequelize.TEXT,
		allowNull: true,
	},
	infoHash: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	folderName: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	// ready | claimed | in_progress | completed | failed | cancelled
	claimStatus: {
		type: Sequelize.STRING,
		allowNull: false,
		defaultValue: "ready",
	},
	claimedAt: {
		type: Sequelize.DATE,
		allowNull: true,
	},
	claimedBy: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	leaseUntil: {
		type: Sequelize.DATE,
		allowNull: true,
	},
	stage: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	progressPct: {
		type: Sequelize.INTEGER,
		allowNull: true,
	},
	etaSeconds: {
		type: Sequelize.INTEGER,
		allowNull: true,
	},
	detail: {
		type: Sequelize.JSONB,
		allowNull: true,
	},
	// TV only: season numbers piratify should fetch. Null for movies / admin URLs.
	seasons: {
		type: Sequelize.JSONB,
		allowNull: true,
	},
	// Worker resume state: infoHash, leftover missing[], path inventories, attempts.
	ledger: {
		type: Sequelize.JSONB,
		allowNull: true,
	},
})

// Append-only history. Never updated, never deleted.
const RequestEvent = sequelize.define(
	"RequestEvent",
	{
		id: {
			type: Sequelize.UUID,
			primaryKey: true,
			defaultValue: Sequelize.UUIDV4,
		},
		requestId: {
			type: Sequelize.STRING,
			allowNull: true,
		},
		jobId: {
			type: Sequelize.UUID,
			allowNull: true,
		},
		// user | admin | portal | pipeline | sortify
		actor: {
			type: Sequelize.STRING,
			allowNull: false,
			defaultValue: "portal",
		},
		type: {
			type: Sequelize.STRING,
			allowNull: false,
		},
		payload: {
			type: Sequelize.JSONB,
			allowNull: true,
		},
	},
	{
		updatedAt: false,
	}
)

Request.hasMany(PipelineJob, { foreignKey: "requestId", sourceKey: "id" })
PipelineJob.belongsTo(Request, { foreignKey: "requestId", targetKey: "id" })
Request.hasMany(RequestEvent, { foreignKey: "requestId", sourceKey: "id" })
RequestEvent.belongsTo(Request, { foreignKey: "requestId", targetKey: "id" })

// Admin TV dry-run tickets (claimed by portal-worker for piratify --dry-run)
// and stored rehearsal reports (movies / skipped TV, status "stored").
const PipelineDryRun = sequelize.define("PipelineDryRun", {
	id: {
		type: Sequelize.UUID,
		primaryKey: true,
		defaultValue: Sequelize.UUIDV4,
	},
	status: {
		type: Sequelize.STRING,
		allowNull: false,
		defaultValue: "ready",
	},
	payload: {
		type: Sequelize.JSONB,
		allowNull: false,
		defaultValue: {},
	},
	result: {
		type: Sequelize.JSONB,
		allowNull: true,
	},
	claimedBy: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	claimedAt: {
		type: Sequelize.DATE,
		allowNull: true,
	},
	error: {
		type: Sequelize.TEXT,
		allowNull: true,
	},
	tmdbId: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	mediaType: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	requestId: {
		type: Sequelize.STRING,
		allowNull: true,
	},
	verdict: {
		type: Sequelize.STRING,
		allowNull: true,
	},
})

module.exports = {
	sequelize: sequelize,
	Sequelize: Sequelize,
	Request: Request,
	PipelineJob: PipelineJob,
	RequestEvent: RequestEvent,
	PipelineDryRun: PipelineDryRun,
}
