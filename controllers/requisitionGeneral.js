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
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
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
    const userId = req?.user?.id;
    const user = await User.findById(userId);
    const userRole = user?.role;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let requisitions;
    let totalRecords;

    if (userRole === 1 || userRole === 2) {
      totalRecords = await Requisition.countDocuments();
      requisitions = await Requisition.find()
        .populate("userId", "name email")
        .skip(skip)
        .limit(limit);
    } else if (userRole === 0) {
      totalRecords = await Requisition.countDocuments({ userId });
      requisitions = await Requisition.find({ userId })
        .populate("userId", "name email")
        .skip(skip)
        .limit(limit);
    } else {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    res.status(200).json({
      data: requisitions,
      totalRecords,
      currentPage: page,
      totalPages: Math.ceil(totalRecords / limit),
    });
  } catch (error) {
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
  const { fromDate, toDate, sortBy, order, columns } = req.query;

  // Validate the dates
  if (!fromDate || !toDate) {
    return res.status(400).json({ message: "Invalid date range" });
  }

  try {
    // Convert fromDate and toDate to Date objects
    const from = new Date(fromDate);
    const to = new Date(toDate);

    // Fetch user details
    const user = await User.findById(req.user.id);

    // Define valid sorting fields
    const validSortFields = ["date", "amount", "department", "drNumber"];
    if (!validSortFields.includes(sortBy)) {
      return res.status(400).json({ message: `Invalid sort field: ${sortBy}` });
    }

    // Determine the query based on the user's role
    let query = {
      date: {
        $gte: from,
        $lte: to,
      },
    };

    if (user.role === 0) {
      query.userId = user._id;
    }

    // Fetch requisitions without sorting initially
    const requisitions = await Requisition.find(query).populate(
      "userId",
      "name emailAddress"
    );

    if (!requisitions || requisitions.length === 0) {
      return res.status(404).json({
        message: "No requisitions found for the specified date range.",
      });
    }

    // Sort requisitions based on sortBy
    const sortedRequisitions = requisitions.sort((a, b) => {
      if (sortBy === "amount") {
        const totalA = a.items.reduce((sum, item) => sum + item.amount, 0);
        const totalB = b.items.reduce((sum, item) => sum + item.amount, 0);
        return order === "asc" ? totalA - totalB : totalB - totalA;
      } else {
        const valueA = a[sortBy];
        const valueB = b[sortBy];
        if (order === "asc") return valueA > valueB ? 1 : -1;
        return valueA < valueB ? 1 : -1;
      }
    });

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
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Add title and user details
    doc.fontSize(24).text("Inventory Pro", 110, 57);
    doc.fontSize(20).text("Requisition Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Report-ID: ${reportId}`, 110, 140);
    doc.fontSize(12).text(`Requester: ${user.name}`, 110, 160);
    doc.fontSize(12).text(`Email: ${user.emailAddress}`, 110, 180);
    doc.fontSize(12).text(`Report Date: ${today}`, 110, 200);
    doc.fontSize(12).text(`From: ${fromDate} To: ${toDate}`, 110, 220);
    doc.moveDown();

    // Define default columns
    const defaultColumns = [
      { label: "DR Number", property: "drNumber", width: 60 },
      { label: "Date", property: "date", width: 60 },
      { label: "Department", property: "department", width: 80 },
      { label: "Requisition Type", property: "requisitionType", width: 80 },
      { label: "Item Name", property: "itemName", width: 80 },
      { label: "Quantity", property: "quantity", width: 60 },
      { label: "Rate", property: "rate", width: 60 },
      { label: "Amount", property: "amount", width: 60 },
    ];

    // Parse and validate selected columns
    const selectedColumns = columns
      ? columns
          .split(",")
          .map((col) => defaultColumns.find((c) => c.property === col))
          .filter(Boolean)
      : defaultColumns;

    if (selectedColumns.length === 0) {
      return res.status(400).json({ message: "Invalid columns selected" });
    }

    // Prepare table headers and rows
    const table = {
      headers: selectedColumns,
      rows: [],
    };

    // Initialize totals
    let totalAmount = 0;
    let totalRate = 0;
    let totalQuantity = 0;
    let totalItems = 0;

    sortedRequisitions.forEach((requisition) => {
      requisition.items.forEach((item) => {
        const row = selectedColumns.map((col) => {
          if (col.property === "date") {
            return moment(requisition.date).format("YYYY-MM-DD");
          } else if (col.property === "itemName") {
            return item.itemName;
          } else if (col.property === "quantity") {
            totalQuantity += item.quantity;
            return item.quantity;
          } else if (col.property === "rate") {
            totalRate += item.rate;
            return item.rate;
          } else if (col.property === "amount") {
            totalAmount += item.amount;
            return item.amount;
          } else {
            return requisition[col.property] || "";
          }
        });
        table.rows.push(row);
        totalItems++;
      });
    });

    // Add totals row
    const totalsRow = selectedColumns.map((col) => {
      if (col.property === "quantity") {
        return totalQuantity;
      } else if (col.property === "rate") {
        return totalRate;
      } else if (col.property === "amount") {
        return totalAmount;
      } else {
        return "";
      }
    });
    table.rows.push(totalsRow);

    // Generate table in PDF
    doc.table(table, {
      prepareHeader: () => {
        doc.font("Helvetica-Bold").fontSize(10);
      },
      prepareRow: (row, i) => {
        doc.font("Helvetica").fontSize(8);
      },
      columnSpacing: 5,
      padding: 5,
      width: 500,
      x: 50,
      y: 280,
    });

    doc.end();

    writeStream.on("finish", async () => {
      // Upload to Cloudinary and send response
      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: "raw",
        public_id: `reports/${fileName}`,
        overwrite: true,
      });

      res.status(200).json({
        message: "PDF report generated successfully",
        url: result.secure_url,
        totals: {
          totalAmount,
          totalRate,
          totalQuantity,
          totalItems,
        },
      });
    });

    writeStream.on("error", (error) => {
      res
        .status(500)
        .json({ message: "Error writing PDF file", error: error.message });
    });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
