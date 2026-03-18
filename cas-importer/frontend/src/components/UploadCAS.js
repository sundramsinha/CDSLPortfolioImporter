import React, { useRef, useState } from "react";
import axios from "axios";

function UploadCAS({ onSuccess, onError }) {
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const chosenFile = event.target.files?.[0] || null;
    setFile(chosenFile);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    const droppedFile = event.dataTransfer?.files?.[0] || null;
    if (!droppedFile) return;

    const looksLikePdf =
      droppedFile.type === "application/pdf" || droppedFile.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      onError("Please drop a valid PDF file.");
      return;
    }
    setFile(droppedFile);
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!file) {
      onError("Please choose a CAS PDF first.");
      return;
    }

    const normalizedPassword = password.trim().toUpperCase();
    if (password.trim() && normalizedPassword !== password.trim()) {
      onError("Password must be uppercase.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (normalizedPassword) {
      formData.append("password", normalizedPassword);
    }

    try {
      setLoading(true);
      const response = await axios.post("/api/upload-cas", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
      onSuccess(response.data);
    } catch (error) {
      const responseData = error?.response?.data;
      const message =
        (typeof responseData === "object" && responseData?.error) ||
        (typeof responseData === "string" && responseData.slice(0, 180)) ||
        error?.message ||
        "Could not parse the uploaded PDF.";
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-widget">
      <div className="upload-inline-row">
        <div
          className={`dropzone compact ${dragOver ? "drag-over" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="Click or drop CAS PDF"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="dropzone-copy">
            <strong>Choose or Drop CAS PDF</strong>
          </div>
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
          />
        </div>

        <input
          type="text"
          placeholder="PDF password (optional)"
          value={password}
          onChange={(event) => setPassword(event.target.value.toUpperCase())}
        />

        <button onClick={handleUpload} disabled={loading}>
          {loading ? "Parsing..." : "Upload and Parse"}
        </button>
      </div>

      <div className="upload-footer">
        <p>
          {file ? (
            <>
              Selected: <strong>{file.name}</strong>
            </>
          ) : (
            "No file selected yet."
          )}
        </p>
        {file ? (
          <button className="link-btn" type="button" onClick={clearFile}>
            Remove file
          </button>
        ) : null}
      </div>

      <div className="upload-note">
        <strong>Note:</strong> Upload the official CDSL Consolidated Account Statement (CAS), typically
        received from <code>eCAS@cdslstatement.com</code>, for the most accurate extraction.
      </div>
    </div>
  );
}

export default UploadCAS;
