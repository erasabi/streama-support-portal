-- Creation of product table

CREATE TABLE IF NOT EXISTS  "Requests" (
  id VARCHAR (50) UNIQUE NOT NULL,
  title VARCHAR (100) NOT NULL,
  "posterPath" VARCHAR (255),
  "createdAt" TIMESTAMP WITH TIME ZONE,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "originalTitle" VARCHAR (120),
  "releaseDate" VARCHAR (20), 
  adult BOOLEAN,
  "mediaType" VARCHAR(20),
  "queueStatus" VARCHAR(40),
  "queueMessage" VARCHAR(120),
  "queueEvents" JSONB[],
  "requestUser" VARCHAR(60)
);