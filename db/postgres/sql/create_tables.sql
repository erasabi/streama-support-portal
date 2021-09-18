-- Creation of product table

CREATE TABLE IF NOT EXISTS  Requests (
  id VARCHAR (50) UNIQUE NOT NULL,
  title VARCHAR (100) NOT NULL,
  "posterPath" VARCHAR (255),
  "createdAt" TIMESTAMP WITH TIME ZONE,
  "updatedAt" TIMESTAMP WITH TIME ZONE
);