"use client";

import React, { createContext, useContext, useCallback, useState, useRef, useEffect, useMemo } from "react";
import { Eye, Pen, Save, X, Upload, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/toast";
import type { ReactNode } from "react";
import { optimizeImageFile } from "@/lib/media/client-optimize";

export type EditMode = "view" | "edit";

interface EditableElement {
  id: string;
  content: string;
  selector: string;
}

interface EditContextValue {
  mode: EditMode;
  setMode: (mode: EditMode) => void;
  toggleEditMode: () => void;
  addEditable: (el: EditableElement) => void;
  removeEditable: (id: string) => void;
  elements: EditableElement[];
  updateElement: (id: string, content: string) => void;
  saveChanges: () => void;
  isSaving: boolean;
}

const EditContext = createContext<EditContextValue | null>(null);

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<EditMode>("view");
  const [elements, setElements] = useState<EditableElement[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const addEditable = useCallback((el: EditableElement) => {
    setElements((prev) => {
      if (prev.some((e) => e.id === el.id)) return prev;
      return [...prev, el];
    });
  }, []);

  const removeEditable = useCallback((id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateElement = useCallback((id: string, content: string) => {
    setElements((prev) =>
      prev.map((e) => (e.id === id ? { ...e, content } : e))
    );
  }, []);

  const saveChanges = useCallback(async () => {
    if (elements.length === 0) {
      toast("No changes to save", "info");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/landing-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements }),
      });

      if (!response.ok) throw new Error("Failed to save changes");

      toast("Changes saved successfully", "success");
      setMode("view");
      setElements([]);
    } catch (error) {
      toast("Error saving changes: " + String(error), "error");
    } finally {
      setIsSaving(false);
    }
  }, [elements, toast]);

  const toggleEditMode = useCallback(() => {
    if (mode === "edit") {
      setMode("view");
      setElements([]);
    } else {
      setMode("edit");
      toast("Edit mode enabled. Click on any text to edit.", "info");
    }
  }, [mode, toast]);

  const value = useMemo(() => ({
    mode,
    setMode,
    addEditable,
    removeEditable,
    elements,
    updateElement,
    saveChanges,
    isSaving,
    toggleEditMode,
  }), [mode, setMode, addEditable, removeEditable, elements, updateElement, saveChanges, isSaving, toggleEditMode]);

  return <EditContext.Provider value={value}>{children}</EditContext.Provider>;
}

export function useEditMode() {
  const context = useContext(EditContext);
  if (!context) {
    throw new Error("useEditMode must be used within an EditModeProvider");
  }
  return context;
}

interface LandingPageFABProps {
  className?: string;
}

export function LandingPageFAB({ className = "" }: LandingPageFABProps) {
  const { isAdmin } = useAuth();
  const { mode, toggleEditMode, saveChanges, setMode, isSaving } = useEditMode();

  if (!isAdmin) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 ${className}`}>
      {mode === "edit" && (
        <>
          <button
            onClick={saveChanges}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg shadow-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isSaving ? "Saving..." : "Save Changes"}</span>
          </button>
          <button
            onClick={() => setMode("view")}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-600 text-white rounded-lg shadow-lg hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        </>
      )}

      <button
        onClick={toggleEditMode}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-200 hover:scale-105 ${
          mode === "edit"
            ? "bg-primary hover:bg-primary/90"
            : "bg-surface-subtle hover:bg-surface-subtle/80 border border-border-light text-text-muted"
        }`}
        title={mode === "edit" ? "Switch to view mode" : "Switch to edit mode"}
      >
        {mode === "edit" ? (
          <Pen className="w-6 h-6" />
        ) : (
          <Eye className="w-6 h-6" />
        )}
      </button>
    </div>
  );
}

interface EditableTextProps {
  id: string;
  selector?: string;
  className?: string;
  children: React.ReactNode;
}

export function EditableText({ id, selector, className = "", children }: EditableTextProps) {
  const { mode, addEditable, removeEditable, elements, updateElement } = useEditMode();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const initialValue =
    elements.find((e) => e.id === id)?.content ??
    (typeof children === "string" ? children : "");

  useEffect(() => {
    addEditable({ id, content: initialValue, selector: selector || id });
    return () => removeEditable(id);
  }, [id, initialValue, selector, addEditable, removeEditable]);

  if (mode === "view") {
    return <span className={className}>{children}</span>;
  }

  if (isEditing) {
    return (
      <div className="inline-block">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            updateElement(id, e.target.value);
          }}
          onBlur={() => setIsEditing(false)}
          className="min-w-[200px] px-2 py-1 text-sm border border-primary rounded focus:outline-none focus:ring-1 focus:ring-primary resize-y-none bg-surface-card text-on-surface"
          rows={Math.max(2, value.split("\n").length)}
          autoFocus
        />
      </div>
    );
  }

  return (
    <span
      className={`cursor-text hover:bg-primary/5 rounded transition-colors ${className}`}
      onClick={() => {
        setValue(initialValue);
        setIsEditing(true);
      }}
      title="Click to edit"
    >
      {children}
    </span>
  );
}

import type { MediaItem } from "@/types";

interface EditableImageProps {
  id: string;
  src: string;
  alt: string;
  className?: string;
}

export function EditableImage({
  id,
  src,
  alt,
  className = "",
}: EditableImageProps) {
  const { mode } = useEditMode();
  const { toast } = useToast();
  const [imageSrc, setImageSrc] = useState(src);
  const [showModal, setShowModal] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(false);
   const [activeTab, setActiveTab] = useState<"upload" | "media">("upload");
   const [currentPage, setCurrentPage] = useState(0);
   const [dragOver, setDragOver] = useState(false);
   const itemsPerPage = 12;

   // Guards one fetch per modal open. `mediaItems.length` cannot guard this:
   // an empty library is a legitimate result, and an effect that reads it
   // would refetch on every re-render while the admin looks at it.
   const mediaFetchedRef = useRef(false);

  const loadMediaItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/media?only_unused=false&limit=50", {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        // "Failed to load media" hides the cause; the route says whether it
        // is a sign-in problem or something else.
        throw new Error(payload?.error ?? `Failed to load media (${response.status})`);
      }
      setMediaItems(payload?.items ?? []);
      setCurrentPage(0);
    } catch (error) {
      toast("Error loading media: " + String(error), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!showModal) {
      // Re-arm so the next open shows freshly uploaded media.
      mediaFetchedRef.current = false;
      return;
    }
    if (activeTab === "media" && !mediaFetchedRef.current) {
      mediaFetchedRef.current = true;
      void loadMediaItems();
    }
  }, [showModal, activeTab, loadMediaItems]);

   const uploadFile = useCallback(
     async (file: File) => {
       const formData = new FormData();
       formData.append("file", await optimizeImageFile(file));
       formData.append("id", id);
       formData.append("area", "landing-page");

        try {
          const response = await fetch("/api/upload-image", {
            method: "POST",
            body: formData,
            credentials: "include",
          });

          const payload = await response.json().catch(() => null);

          if (!response.ok) {
            // The route reports the real cause: an auth failure, an
            // unsupported file, or a storage backend that is not configured.
            // Showing it is the difference between "Upload failed" and
            // "Object storage is not configured".
            throw new Error(payload?.error ?? `Upload failed (${response.status})`);
          }

          setImageSrc(payload?.url);
          setShowModal(false);
          toast("Image uploaded successfully", "success");
        } catch (error) {
          toast("Error uploading image: " + String(error), "error");
        }
     },
     [id, toast]
   );

   const handleImageUpload = useCallback(
     (e: React.ChangeEvent<HTMLInputElement>) => {
       const file = e.target.files?.[0];
       if (!file) return;
       void uploadFile(file);
     },
     [uploadFile]
   );

   const handleDrop = useCallback(
     (e: React.DragEvent<HTMLDivElement>) => {
       e.preventDefault();
       setDragOver(false);
       const file = e.dataTransfer.files?.[0];
       if (!file) return;
       void uploadFile(file);
     },
     [uploadFile]
   );

   const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
     e.preventDefault();
     setDragOver(true);
   }, []);

   const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
     e.preventDefault();
     setDragOver(false);
   }, []);

  const handleSelectMedia = useCallback(() => {
    if (!selectedMedia) return;
    setImageSrc(selectedMedia.url);
    setShowModal(false);
    toast("Image updated successfully", "success");
  }, [selectedMedia, toast]);

  const handleEditClick = useCallback(() => {
    setShowModal(true);
    setActiveTab("upload");
    setSelectedMedia(null);
  }, []);

  const paginatedItems = useMemo(() => {
    const start = currentPage * itemsPerPage;
    return mediaItems.slice(start, start + itemsPerPage);
  }, [mediaItems, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(mediaItems.length / itemsPerPage);

  return (
    <div className="relative inline-block">
      {mode === "edit" && (
        <button
          onClick={handleEditClick}
          className="absolute top-2 right-2 z-10 w-7 h-7 bg-primary/90 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-primary transition-colors shadow-md"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={alt}
        className={className}
        style={mode === "edit" ? { cursor: "pointer", border: "2px dashed #ddd" } : undefined}
      />

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Change Image</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border-b flex">
              <button
                onClick={() => setActiveTab("upload")}
                className={`flex-1 py-2 text-center text-sm font-medium ${
                  activeTab === "upload"
                    ? "bg-primary/10 text-primary border-b-2 border-primary"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Upload New
              </button>
              <button
                onClick={() => setActiveTab("media")}
                className={`flex-1 py-2 text-center text-sm font-medium ${
                  activeTab === "media"
                    ? "bg-primary/10 text-primary border-b-2 border-primary"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                From Media Library
              </button>
            </div>

            <div className="p-4">
              {activeTab === "upload" && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-lg text-center py-10 px-6 transition-colors ${
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-gray-300 bg-gray-50"
                  }`}
                >
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-sm text-gray-600 mb-3">
                    Drag & drop an image here, or
                  </p>
                  <label className="cursor-pointer inline-block px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors">
                    Choose File
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-400 mt-3">
                    JPEG, PNG, WebP or AVIF — converted to WebP automatically
                  </p>
                </div>
              )}

              {activeTab === "media" && (
                <>
                  {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading media...</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-2 mb-4">
                        {paginatedItems.map(item => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedMedia(item)}
                            className={`relative w-20 h-20 rounded border-2 transition-colors ${
                              selectedMedia?.id === item.id
                                ? "border-primary"
                                : "border-gray-200 hover:border-gray-400"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.url}
                              alt={item.file_name}
                              className="w-full h-full object-cover rounded"
                            />
                          </button>
                        ))}
                      </div>

                      {totalPages > 1 && (
                        <div className="flex justify-between items-center text-sm text-gray-600">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                            disabled={currentPage === 0}
                            className="flex items-center gap-1 disabled:opacity-50"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Prev
                          </button>
                          <span>
                            Page {currentPage + 1} of {totalPages}
                          </span>
                          <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={currentPage === totalPages - 1}
                            className="flex items-center gap-1 disabled:opacity-50"
                          >
                            Next
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={handleSelectMedia}
                          disabled={!selectedMedia}
                          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          Select Image
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { LandingPageFAB as FAB };
