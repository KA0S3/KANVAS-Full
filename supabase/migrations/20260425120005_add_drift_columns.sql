-- =====================================================
-- ADD DRIFT COLUMNS TO STORAGE_USAGE - Phase 5 Addition
-- Low-I/O Backend Architecture
-- =====================================================
-- This migration adds drift detection columns to storage_usage table
-- Used for monitoring storage quota drift and reconciliation
-- =====================================================

-- Add drift detection columns to storage_usage table
ALTER TABLE storage_usage 
ADD COLUMN IF NOT EXISTS drift_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS drift_bytes BIGINT NOT NULL DEFAULT 0;

-- Add index for drift monitoring queries
CREATE INDEX IF NOT EXISTS idx_storage_usage_drift 
ON storage_usage(drift_detected_at) 
WHERE drift_detected_at IS NOT NULL;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
