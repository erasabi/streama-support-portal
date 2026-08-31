"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.createTable("PipelineJobs", {
			id: {
				type: Sequelize.UUID,
				defaultValue: Sequelize.UUIDV4,
				primaryKey: true,
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
			createdAt: {
				type: Sequelize.DATE,
				allowNull: false,
			},
			updatedAt: {
				type: Sequelize.DATE,
				allowNull: false,
			},
		})

		await queryInterface.addIndex("PipelineJobs", ["claimStatus"])
		await queryInterface.addIndex("PipelineJobs", ["requestId"])
	},

	down: async (queryInterface) => {
		await queryInterface.dropTable("PipelineJobs")
	},
}
