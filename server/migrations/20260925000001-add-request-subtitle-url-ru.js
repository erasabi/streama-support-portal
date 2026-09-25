"use strict"

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn("Requests", "subtitleUrlRu", {
			type: Sequelize.TEXT,
			allowNull: true,
		})
	},

	async down(queryInterface) {
		await queryInterface.removeColumn("Requests", "subtitleUrlRu")
	},
}
