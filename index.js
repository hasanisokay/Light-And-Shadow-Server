const jwt = require('jsonwebtoken');
const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
require("dotenv").config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);


// middleware
app.use(express.json())
app.use(cors())

// verifying jwt token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: "unauthorized access" })
  }
  // bearer token
  const token = authorization.split(" ")[1]

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: "unauthorized access" })
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
    const usersCollection = client.db("lightAndShadow").collection("users")
    const classCollection = client.db("lightAndShadow").collection("classes")
    const selectedClassCollection = client.db("lightAndShadow").collection("selectedClass")
    const paymentCollection = client.db("lightAndShadow").collection("payments")
    const studentFeedbackCollection = client.db("lightAndShadow").collection("studentsFeedback")

    // jwt
    app.post("/jwt", (req, res) => {
      const userMail = req.body;
      const token = jwt.sign(userMail, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10hr' })
      res.send({ token })
    })

    // admin verify middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req?.decoded?.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ error: true, message: "forbiddedn access" })
      }
      next();
    }

    // verifying a user is instructor or not
    const verifyInstructor = async (req, res, next) => {
      const email = req?.decoded?.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res.status(403).send({ error: true, message: "forbiddedn access" })
      }
      next();
    }


    // getting all the approved classes
    app.get("/classes", async (req, res) => {
      const result = await classCollection.find({ status: "approved" }).toArray()
      res.send(result)
    })

    // getting a instructors classes.
    app.get("/instructor/:id", async (req, res) => {
      const instructorId = req.params.id;
      const queryForInstructor = { _id: new ObjectId(instructorId) }
      const instructor = await usersCollection.findOne(queryForInstructor)
      const email = instructor.email;

      const queryForClasses = { instructor_email: email, status: "approved" }
      const result = await classCollection.find(queryForClasses).toArray()
      res.send(result)
    })
    // getting all students feedback
    app.get("/stuedntsFeedback", async(req,res)=>{
      const result = await studentFeedbackCollection.find().toArray()
      res.send(result)
    })

    // getting all instructos data
    app.get("/instructors", async (req, res) => {
      const result = await usersCollection.find({ role: "instructor" }).toArray()
      res.send(result)
    })

    // user api
    // writing frist time sign upd users name and email in the database
    app.post('/users', async (req, res) => {
      const newUser = req.body;
      newUser.role = "student"
      const query = { email: newUser.email }
      const existingUser = await usersCollection.findOne(query);
      if (!existingUser) {
        const result = await usersCollection.insertOne(newUser)
        res.send(result)
        return
      }
      return res.send({ message: "user already exists" })
    })

    // check if a user is admin or not
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      // first level of security is checking verifyJWT token. 
      const email = req.params.email;
      // second level of security. checking user email and token email same or not
      if (req.decoded?.email !== email) {
        res.send({ admin: false })
        return
      }

      // checking admin
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" }
      res.send(result);

    })

    // checking if user is instructor
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded?.email !== email) {
        res.send({ instructor: false })
        return
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" }
      res.send(result)
    })

    // getting popular classes
    app.get("/classes/popular", async (req, res) => {
      const result = await classCollection.find().sort({ students_in_class: -1 }).limit(6).toArray();
      res.send(result)
    })
    // getting popular instructors
    app.get("/instructors/popular", async (req, res) => {
      const result = await usersCollection.find({ role: "instructor" }).sort({ students_in_class: -1 }).limit(6).toArray()
      res.send(result)
    })

    // adding selected class to database and checking if its already added by same user.
    app.post("/selectedClass", verifyJWT, async (req, res) => {
      const selectedClass = req.body;
      const query = { classId: selectedClass.classId, clickedUserEmail: selectedClass.clickedUserEmail };
      // console.log(selectedClass);
      const previouslySelected = await selectedClassCollection.findOne(query)
      if (previouslySelected) {
        res.send({ message: "Already Selected" })
        return
      }
      selectedClass.status = "pending"
      const result = await selectedClassCollection.insertOne(selectedClass)
      res.send(result)
    })

    // getting selected items for a user 
    app.get("/getSelectedClass", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded?.email;
      const email = req.query?.email;
      const status = req.query?.status;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: "forbidden access" })
      }
      const foundIds = await selectedClassCollection.find({ clickedUserEmail: email }).toArray();
      let filteredIds = []
      const filterdData = foundIds.filter(item => {
        if (item.status === status) {
          filteredIds.push(item.classId)
        }
      })
      console.log(filteredIds);
      // console.log("hitted with", status);
      const classes = await classCollection.find({_id:{ $in:filteredIds}}).toArray()
      res.send(classes)
    });

    // deleting students selected class
    app.delete("/deleteClass/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await selectedClassCollection.deleteOne({ classId: id })
      res.send(result)
    })

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"]
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // adding successfull payments to db
    app.post("/payments", verifyJWT, async (req, res) => {
      const paymentData = req.body;
      const paidClassId = paymentData.paidForClass._id
      const filter = {_id: new ObjectId(paidClassId)} 
      const updateDoc ={
        $inc: {
          students_in_class: 1
        }
      }
      const increaClassInStudnets = await classCollection.updateOne(filter, updateDoc)
      const result = await paymentCollection.insertOne(paymentData);
      res.send(result)
    })
    // change status to enrolled after payment
    app.patch("/selectedClass/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { classId: id }
      const updateDoc = {
        $set: {
          status: 'enrolled'
        }
      }
      const reduceAvailableSeats = await classCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $inc: { available_seats: -1 } },
        { returnOriginal: false }
      )
      const result = await selectedClassCollection.updateOne(filter, updateDoc);
      console.log(result);
      res.send(result)
    })

    // getting all payments for a user
    app.get("/paymentHistory", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await paymentCollection.find({ email: email }).sort({ date: -1 }).toArray()
      res.send(result)
    })


    // instructors activity here
    // .................................................................
    // instructors adding new class to db
    app.post("/addNewClass", verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      newClass.students_in_class = 0;
      newClass.status = "pending";
      const result = await classCollection.insertOne(newClass)
      res.send(result)
    })

    // get a specific instructos all class
    app.get("/instructorsAllClass", verifyJWT, verifyInstructor, async (req, res) => {
      const email = req.query.email;
      if (email !== req?.decoded?.email) {
        return res.status(403).send({ error: true, message: "forbidden access" })
      }
      const result = await classCollection.find({ instructor_email: email }).toArray()
      res.send(result);
    })
    // ..........................................................................

    // Admin activity
    // ...............................................................
    // get all user
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })
    // make admin
    app.post("/makeAdmin", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.body.email;
      const filter = {
        email: email
      }
      const updateDoc = {
        $set: {
          role: "admin"
        },
      }
      const result = await usersCollection.updateOne(filter, updateDoc)
      res.send(result)

    })
    // make instructor
    app.post("/makeInstructor", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.body.email;
      const filter = {
        email: email
      }
      console.log(email);
      const updateDoc = {
        $set: {
          role: "instructor",
          classes_taken: 0,
          students_in_class: 0
        },
      }
      const result = await usersCollection.updateOne(filter, updateDoc)
      res.send(result)

    })
    // getting all classes for admin dashoboard 
    app.get("/getAllClasses", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await classCollection.find().toArray()
      res.send(result)
    })
    // changing class status to approve from admin dashboard 
    app.post("/changeClassStatus/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const updateDoc = {
        $set: {
          status: status
        }
      }
      const filter = { _id: new ObjectId(id) }
      const result = await classCollection.updateOne(filter, updateDoc)
      res.send(result)
    })
    // adding feedback
    app.post("/addFeedback", verifyJWT, verifyAdmin, async (req, res) => {
      const feedback = req.body.feedback;
      const id = req.body.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          feedback: feedback
        }
      }
      const result = await classCollection.updateOne(filter, updateDoc)
      res.send(result)
    })
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);



app.get("/", (req, res) => {
  res.send("Light & Shadow server is running")
})

app.listen(port, () => {
  console.log("Light & Shadow is running on", port);
})