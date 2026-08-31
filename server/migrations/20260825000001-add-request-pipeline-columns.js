"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		const table = await queryInterface.describeTable("Requests")
		const addColumn = async (name, spec) => {
			if (!table[name]) {
				await queryInterface.addColumn("Requests", name, spec)
			}
		}

		await addColumn("imdbId", { type: Sequelize.STRING, allowNull: true })
		await addColumn("magnetUrl", { type: Sequelize.TEXT, allowNull: true })
		await addColumn("magnetHash", { type: Sequelize.STRING, allowNull: true })
		await addColumn("magnetQuality", { type: Sequelize.STRING, allowNull: true })
		await addColumn("subtitleUrl", { type: Sequelize.TEXT, allowNull: true })
		await addColumn("magnetLookupStatus", {
			type: Sequelize.STRING,
			allowNull: true,
			defaultValue: "pending",
		})
		await addColumn("magnetLookedUpAt", { type: Sequelize.DATE, allowNull: true })
		await addColumn("magnetFoundAt", { type: Sequelize.DATE, allowNull: true })
		await addColumn("pipelineStage", { type: Sequelize.STRING, allowNull: true })
		await addColumn("pipelineStageDetail", { type: Sequelize.JSONB, allowNull: true })
		await addColumn("queueStatusSource", {
			type: Sequelize.STRING,
			allowNull: true,
			defaultValue: "derived",
		})
		await addColumn("streamaMediaId", { type: Sequelize.INTEGER, allowNull: true })
		await addColumn("streamaVideoId", { type: Sequelize.INTEGER, allowNull: true })
		await addColumn("highlightedAt", { type: Sequelize.DATE, allowNull: true })
		await addColumn("archivedAt", { type: Sequelize.DATE, allowNull: true })

		// Promote the pre-existing unique `id` column to a real primary key so
		// associations and upserts behave. Safe because `id` is already UNIQUE
		// NOT NULL from the original migration.
		try {
			await queryInterface.addConstraint("Requests", {
				fields: ["id"],
				type: "primary key",
				name: "Requests_pkey",
			})
		} catch (err) {
			// Ignore if a primary key already exists.
			console.log("Requests primary key not added:", err.message)
		}
	},

	down: async (queryInterface) => {
		const columns = [
			"imdbId",
			"magnetUrl",
			"magnetHash",
			"magnetQuality",
			"subtitleUrl",
			"magnetLookupStatus",
			"magnetLookedUpAt",
			"magnetFoundAt",
			"pipelineStage",
			"pipelineStageDetail",
			"queueStatusSource",
			"streamaMediaId",
			"streamaVideoId",
			"highlightedAt",
			"archivedAt",
		]
		for (const col of columns) {
			await queryInterface.removeColumn("Requests", col).catch(() => {})
		}
	},
}
