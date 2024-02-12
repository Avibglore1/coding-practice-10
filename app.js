const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

const app = express()
app.use(express.json())

let db = null
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () =>
      console.log(`Server running at http://localhost:3000/`),
    )
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const convertStateObjToResponseObj = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertdistrictObjToResponseobj = obj => {
  return {
    districtId: obj.district_id,
    districtName: obj.district_name,
    stateId: obj.state_id,
    cases: obj.cases,
    cured: obj.cured,
    active: obj.active,
    deaths: obj.deaths,
  }
}

function authenticateToken(request, response, next) {
  let jwttoken
  const authHeader = request.headers["authorization"]
  if (authHeader !== undefined) {
    jwttoken = authHeader.split(' ')[1]
  }
  if (jwttoken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwttoken, 'my_secret_token', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = ${username};`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwttoken = jwt.sign(payload, 'my_secret_token')
      response.send({jwttoken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/states/', authenticateToken, async (request, response) => {
  const getStateQuery = `
        SELECT * 
        FROM state;`
  const statesArray = await db.all(getStateQuery)
  response.send(
    statesArray.map((eachState) => convertStateObjToResponseObj(eachState)),
  )
})

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
     SELECT *
     FROM state
     WHERE state_id = ${stateId};`
  const state = await db.get(getStateQuery)
  response.send(convertStateObjToResponseObj(state))
})

app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
     SELECT * 
     FROM district
     WHERE district_id = ${districtId};`
    const district = await db.get(getDistrictQuery)
    response.send(convertdistrictObjToResponseobj(district))
  },
)

app.post('/districts/', authenticateToken, async (request, response) => {
  const {stateId, districtName, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `
        INSERT INTO 
            district(state_id, district_name, cases, cured, active, deaths)
        VALUES (
            ${stateId},
           '${districtName}',
            ${cases},
            ${cured},
            ${active},
            ${deaths});`
  await db.run(postDistrictQuery)
  response.send('District Successfully Added')
})

app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
        DELETE FROM 
            district
        WHERE 
            district_id = ${districtId};`
    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
        UPDATE district
        SET
            district_name = '${districtName}',
            state_id = ${stateId},
            cases = ${cases},
            cured = ${cured},
            active = ${active},
            deaths = ${deaths}
        WHERE 
            district_id = ${districtId};`
    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStateStatQuery = `
    SELECT 
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM 
      district
    WHERE 
      state_id = ${stateId};`

    const stats = await db.get(getStateStatQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)

module.exports = app
