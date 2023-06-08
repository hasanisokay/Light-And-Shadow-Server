const jwt = require('jsonwebtoken');
const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
require("dotenv").config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);

const corsOptions ={
  origin:'http://localhost:5173', 
  credentials:true,            //access-control-allow-credentials:true
  optionSuccessStatus:200
}
app.use(cors(corsOptions));


// middleware

app.use(express.json())
// app.use(cors())

// verifying jwt token
const verifyJWT = (req,res,next)=>{
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error:true, message:"unauthorized access"})
  }
  // bearer token
  const token = authorization.split(" ")[1]

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err,decoded)=>{
    if(err){
      return res.status(401).send({error: true, message: "unauthorized access"})
    }
    req.decoded = decoded
    next();
  })
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
var uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@ac-hzckllx-shard-00-00.wvig2d6.mongodb.net:27017,ac-hzckllx-shard-00-01.wvig2d6.mongodb.net:27017,ac-hzckllx-shard-00-02.wvig2d6.mongodb.net:27017/?ssl=true&replicaSet=atlas-sxh7jl-shard-0&authSource=admin&retryWrites=true&w=majority`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    const menuCollection = client.db("lightAndShadow").collection("menuCollection")
    const reviewsCollection =client.db("lightAndShadow").collection("reviewsCollection")    
    const cartCollection =client.db("lightAndShadow").collection("cartCollection")    
    const usersCollection =client.db("lightAndShadow").collection("users")    
    const paymentCollection =client.db("lightAndShadow").collection("paymentCollection")    
    
    // jwt
    app.post("/jwt", (req,res)=>{
      const userMail = req.body;
      const token = jwt.sign(userMail, process.env.ACCESS_TOKEN_SECRET, {expiresIn:'10hr'})
      res.send({token}) 
    })

    // admin verify middleware
    // warning: use verifyJWT before verifyAdmin. cause decode email is used here.
    const verifyAdmin = async(req,res,next)=>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      if(user?.role !== "admin"){
        return res.status(403).send({error: true, message: "forbiddedn access"})
      }
    }





    // user api
    // writing frist time sign upd users name and email in the database
    app.post('/users',  async(req,res)=>{
      const newUser = req.body;
      newUser.role = "student"
      const query = {email:newUser.email}
      const existingUser = await usersCollection.findOne(query);
      if(!existingUser){
        const result = await usersCollection.insertOne(newUser)
        res.send(result)
        return
      }
      return res.send({message:"user already exists"})
    })


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);











app.get("/", (req,res)=>{
    res.send("Light & Shadow server is running")
})

app.listen(port, ()=>{
    console.log("Light & Shadow is running on", port);
})