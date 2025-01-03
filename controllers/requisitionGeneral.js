import { Requisition } from "../models/requisitionGeneral.js";
import { validationResult } from "express-validator";
import { User } from "../models/user.js";
import PDFDocument from "pdfkit";
import moment from "moment";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import pdfTable from "pdfkit-table";

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
    const userId = req?.user?.id;
    const user = await User.findById(userId);
    const userRole = user?.role; // Assuming role is stored in req.user.role
    let requisitions;
    console.log("use", userRole);
    if (userRole === 1 || userRole === 2) {
      requisitions = await Requisition.find().populate("userId", "name email");
    } else if (userRole === 0) {
      requisitions = await Requisition.find({ userId }).populate(
        "userId",
        "name email"
      );
    } else {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    res.status(200).json(requisitions);
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
    const deletedRequisition = await Requisition.findByIdAndDelete({
      _id: requisitionId,
    });

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
export const searchRequisitionByDrNumber = async (req, res) => {
  const { drNumber } = req.query;

  if (!drNumber) {
    return res.status(400).json({ message: "DR Number is required" });
  }

  try {
    const requisitions = await Requisition.find({ drNumber }).populate(
      "userId",
      "name email"
    );

    if (requisitions.length === 0) {
      return res
        .status(404)
        .json({ message: "No requisitions found with the provided DR Number" });
    }

    res.status(200).json(requisitions);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const generatePdfReport = async (req, res) => {
  try {
    const requisitions = await Requisition.find().populate(
      "userId",
      "name email"
    );

    if (requisitions.length === 0) {
      return res.status(404).json({ message: "No requisitions found" });
    }

    // Ensure the reports directory exists
    const reportsDir = path.join(__dirname, "reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir);
    }

    const today = moment().format("YYYY-MM-DD");
    const reportId = `RP-${Date.now()}`;
    const fileName = `requisition_report_${today}.pdf`;
    const filePath = path.join(reportsDir, fileName);

    const doc = new pdfTable({ margin: 30 });
    doc.pipe(fs.createWriteStream(filePath));

    // Add logo
    const logoPath =
      "C:/Users/Abdullah/Downloads/Blue Flat Illustrative Human Artificial Intelligence Technology Logo.png";
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 50 });
    }

    // Add title
    doc.fontSize(20).text("Inventory Pro", 110, 57);
    doc.fontSize(20).text("Requisition Report", { align: "center" });
    doc.moveDown();

    let totalAmount = 0;

    const table = {
      headers: [
        { label: "DR Number", property: "drNumber", width: 60, renderer: null },
        { label: "Date", property: "date", width: 60, renderer: null },
        {
          label: "Department",
          property: "department",
          width: 80,
          renderer: null,
        },
        {
          label: "Requisition Type",
          property: "requisitionType",
          width: 80,
          renderer: null,
        },
        { label: "Item Name", property: "itemName", width: 80, renderer: null },
        { label: "Quantity", property: "quantity", width: 60, renderer: null },
        { label: "Rate", property: "rate", width: 60, renderer: null },
        { label: "Amount", property: "amount", width: 60, renderer: null },
      ],
      rows: [],
    };

    requisitions.forEach((requisition) => {
      requisition.items.forEach((item) => {
        table.rows.push([
          requisition.drNumber,
          moment(requisition.date).format("YYYY-MM-DD"),
          requisition.department,
          requisition.requisitionType,
          item.itemName,
          item.quantity,
          item.rate,
          item.amount,
        ]);
        totalAmount += item.amount;
      });
    });

    doc.table(table, {
      prepareHeader: () => {
        doc.font("Helvetica-Bold").fontSize(10).fillColor("red");
      },
      prepareRow: (row, i) => {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(i % 2 === 0 ? "green" : "black");
      },
      columnSpacing: 5,
      padding: 5,
      width: 500,
      x: 50,
      y: 150,
    });

    doc.moveDown();
    doc.fontSize(12).text(`Total Amount: ${totalAmount}`, { align: "right" });

    // Add stamp at the bottom
    doc
      .fontSize(10)
      .fillColor("gray")
      .text(
        `Inventory Pro - Report ID: ${reportId}`,
        50,
        doc.page.height - 50,
        {
          align: "center",
          width: doc.page.width - 100,
        }
      );

    doc.end();

    res
      .status(200)
      .json({ message: "PDF report generated successfully", filePath });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
