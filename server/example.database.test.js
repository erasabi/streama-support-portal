const db = require('./database');

const mockRequestedMediaItem = {
    id: 1,
    title: 'The Matrix',
}

beforeAll(async () => {
    // connect to database 
    // using sequelize.sync({force: true}): adds a DROP TABLE IF EXISTS before trying to create the table
    await db.sequelize.sync();
});

it('create person', async () => {
    expect.assertions(2);
    const request = await db.Request.create(mockRequestedMediaItem);
    expect(request.id).toEqual(1);
    expect(request.title).toEqual('The Matrix');
});

it('get requested media', async () => {
    expect.assertions(1);
    const requests = await db.Request.findByPk(1);

    expect(requests.title).toEqual('The Matrix');
});

it('delete person', async () => {
    expect.assertions(1);
    await db.Request.destroy({
        where: {
            id: 1
        }
    });
    const request = await db.Request.findByPk(1);
    expect(request).toBeNull();
});

afterAll(async () => {
    await db.sequelize.close();
});
