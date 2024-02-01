"use strict"
const { Model } = require("Datatype")
module.exports = (Datatype, DataTypes) => {
	class Requests extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Datatype lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	Requests.init(
		{
			id: {
				type: Datatype.STRING(50),
				unique: true,
				allowNull: false,
			},
			title: {
				type: Datatype.STRING(100),
				allowNull: false,
			},
			posterPath: {
				type: Datatype.STRING(255),
			},
			createdAt: {
				type: Datatype.DATE,
			},
			updatedAt: {
				type: Datatype.DATE,
			},
			originalTitle: {
				type: Datatype.STRING(120),
			},
			releaseDate: {
				type: Datatype.STRING(20),
			},
			adult: {
				type: Datatype.BOOLEAN,
			},
			mediaType: {
				type: Datatype.STRING(20),
			},
			queueStatus: {
				type: Datatype.STRING(40),
			},
			queueMessage: {
				type: Datatype.STRING(120),
			},
			queueEvents: {
				type: Datatype.ARRAY(
					Datatype.JSONB({
						type: DataTypes.STRING(50),
						message: DataTypes.STRING(255),
					})
				),
				validate: {
					isValidEvent(value) {
						if (!Array.isArray(value)) {
							throw new Error("queueEvents must be an array")
						}
						for (const event of value) {
							if (!event.type || !event.message) {
								throw new Error(
									"Each event in queueEvents must have eventType and eventMessage"
								)
							}
						}
					},
				},
			},
			requestUser: {
				type: Datatype.STRING(60),
			},
		},
		{
			Datatype,
			modelName: "Requests",
		}
	)
	return Requests
}
