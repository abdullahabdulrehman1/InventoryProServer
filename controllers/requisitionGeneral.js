import { Requisition } from "../models/requisitionGeneral.js";
import { validationResult } from "express-validator";

export const createRequisition = async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    userId,
    drNumber,
    date,
    requisitionType,
    department,
    headerRemarks,
    items,
  } = req.body;

  try {
    // Check if drNumber already exists
    const existingRequisition = await Requisition.findOne({ drNumber });
    if (existingRequisition) {
      return res.status(400).json({ message: "DR Number already exists" });
    }

    // Create a new requisition instance
    const newRequisition = new Requisition({
      userId,
      drNumber,
      date,
      requisitionType,
      department,
      headerRemarks,
      items,
    });

    // Save the requisition to the database
    await newRequisition.save();

    // Send a success response
    res.status(201).json({
      message: "Requisition created successfully",
      requisition: newRequisition,
    });
  } catch (error) {
    // Handle any errors
    res
      .status(500)
      .json({ message: "Error creating requisition", error: error.message });
  }
};
export const showRequisition = async (req, res) => {
  try {
    // Retrieve userId from request parameters or query
    const userId = req.user.id;

    // Validate userId
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const requisitions = await Requisition.find({ userId }).populate(
      "userId",
      "name email"
    );

    res.json(requisitions);
  } catch (error) {
    // Handle any errors that occur during the fetch
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const deleteRequisition = async (req, res) => {
  try {
    // Retrieve requisitionId from request parameters or query
    const { requisitionId } = req.body;

    // Validate requisitionId
    if (!requisitionId) {
      return res.status(400).json({ message: "Requisition ID is required" });
    }

    // Find the requisition by ID and delete it
    const deletedRequisition = await Requisition.findByIdAndDelete({_id:requisitionId});

    // Check if the requisition was found and deleted
    if (!deletedRequisition) {
      return res.status(404).json({ message: "Requisition not found" });
    }

    // Send a success response
    res.json({ message: "Requisition deleted successfully" });
  } catch (error) {
    // Handle any errors that occur during the delete
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};


export const updateRequisition = async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { requisitionId, updateData } = req.body;

  try {
    // Validate requisition ID
    if (!requisitionId) {
      return res.status(400).json({ message: "Requisition ID is required" });
    }

    // Validate update data
    if (!updateData) {
      return res.status(400).json({ message: "Update data is required" });
    }

    // Find the requisition by ID and update it with the new data
    const updatedRequisition = await Requisition.findByIdAndUpdate(
      requisitionId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    // Check if the requisition was found and updated
    if (!updatedRequisition) {
      return res.status(404).json({ message: "Requisition not found" });
    }

    // Send the updated requisition as a response
    res.json(updatedRequisition);
  } catch (error) {
    // Handle any errors that occur during the update
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};