"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.createTable("RequestEvents", {
			id: {
				type: Sequelize.UUID,
				defaultValue: Sequelize.UUIDV4,
				primaryKey: true,
			},
			requestId: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			jobId: {
				type: Sequelize.UUID,
				allowNull: true,
			},
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
			createdAt: {
				type: Sequelize.DATE,
				allowNull: false,
			},
		})

		await queryInterface.addIndex("RequestEvents", ["requestId"])
		await queryInterface.addIndex("RequestEvents", ["createdAt"])
	},

	down: async (queryInterface) => {
		await queryInterface.dropTable("RequestEvents")
	},
}
