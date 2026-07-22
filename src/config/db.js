const mongoose = require("mongoose");


async function connectDB(){
try{
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Database connected successfully")
}catch(e){
  console.error("Error on db.js", e.message);

}
}

module.exports = { connectDB };