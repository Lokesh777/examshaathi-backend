const mongoose = require("mongoose");

const optSchema = new mongoose.Schema({
       email:{
        type:String,
        required:[true,  "Email is required"]
       },
       user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"users",
        required:[true, "User is required"]
       },
       otpHash:{
        type:String,
        required:[true, "Otp hash is required"]
       }
},
{
  timestamps:true
}
)

const otpModel = mongoose.model("otps", optSchema)

module.exports = otpModel