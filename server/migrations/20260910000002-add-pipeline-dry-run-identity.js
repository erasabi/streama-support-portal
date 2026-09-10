"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.addColumn("PipelineDryRuns", "tmdbId", {
			type: Sequelize.STRING,
			allowNull: true,
		})
		await queryInterface.addColumn("PipelineDryRuns", "mediaType", {
			type: Sequelize.STRING,
			allowNull: true,
		})
		await queryInterface.addColumn("PipelineDryRuns", "requestId", {
			type: Sequelize.STRING,
			allowNull: true,
		})
		await queryInterface.addColumn("PipelineDryRuns", "verdict", {
			type: Sequelize.STRING,
			allowNull: true,
		})
		await queryInterface.addIndex("PipelineDryRuns", ["tmdbId"])
		await queryInterface.addIndex("PipelineDryRuns", ["requestId"])
	},
	down: async (queryInterface) => {
		await queryInterface.removeIndex("PipelineDryRuns", ["requestId"])
		await queryInterface.removeIndex("PipelineDryRuns", ["tmdbId"])
		await queryInterface.removeColumn("PipelineDryRuns", "verdict")
		await queryInterface.removeColumn("PipelineDryRuns", "requestId")
		await queryInterface.removeColumn("PipelineDryRuns", "mediaType")
		await queryInterface.removeColumn("PipelineDryRuns", "tmdbId")
	},
}
