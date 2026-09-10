"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.createTable("PipelineDryRuns", {
			id: {
				type: Sequelize.UUID,
				defaultValue: Sequelize.UUIDV4,
				primaryKey: true,
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
			createdAt: {
				type: Sequelize.DATE,
				allowNull: false,
			},
			updatedAt: {
				type: Sequelize.DATE,
				allowNull: false,
			},
		})
		await queryInterface.addIndex("PipelineDryRuns", ["status"])
	},
	down: async (queryInterface) => {
		await queryInterface.dropTable("PipelineDryRuns")
	},
}
