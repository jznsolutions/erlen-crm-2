
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "announcements": {
                  Row: {
                    "audience_role_ids": (string)[],"body": string,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"is_pinned": boolean,"published_at": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience_role_ids"?: (string)[],"body": string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"is_pinned"?: boolean,"published_at"?: string,"title": string
                  }
                  Update: {
                    "audience_role_ids"?: (string)[],"body"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"is_pinned"?: boolean,"published_at"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"applicants": {
                  Row: {
                    "consent_at": string,"created_at": string,"email": string,"full_name": string,"handled_by": string | null,"id": string,"message": string | null,"notes": string | null,"phone": string,"source": string,"status": Database["public"]['Enums']["applicant_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consent_at": string,"created_at"?: string,"email": string,"full_name": string,"handled_by"?: string | null,"id"?: string,"message"?: string | null,"notes"?: string | null,"phone": string,"source"?: string,"status"?: Database["public"]['Enums']["applicant_status"],"updated_at"?: string
                  }
                  Update: {
                    "consent_at"?: string,"created_at"?: string,"email"?: string,"full_name"?: string,"handled_by"?: string | null,"id"?: string,"message"?: string | null,"notes"?: string | null,"phone"?: string,"source"?: string,"status"?: Database["public"]['Enums']["applicant_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "applicants_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"id": number,"new_data": Json | null,"occurred_at": string,"old_data": Json | null,"record_id": string | null,"subject_user_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"id"?: never,"new_data"?: Json | null,"occurred_at"?: string,"old_data"?: Json | null,"record_id"?: string | null,"subject_user_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"id"?: never,"new_data"?: Json | null,"occurred_at"?: string,"old_data"?: Json | null,"record_id"?: string | null,"subject_user_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"booking_availability": {
                  Row: {
                    "end_time": string,"id": string,"start_time": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "end_time": string,"id"?: string,"start_time": string,"weekday": number
                  }
                  Update: {
                    "end_time"?: string,"id"?: string,"start_time"?: string,"weekday"?: number
                  }
                  Relationships: [
                    
                  ]
                },"booking_blocks": {
                  Row: {
                    "created_by": string | null,"ends_at": string,"id": string,"reason": string | null,"starts_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_by"?: string | null,"ends_at": string,"id"?: string,"reason"?: string | null,"starts_at": string
                  }
                  Update: {
                    "created_by"?: string | null,"ends_at"?: string,"id"?: string,"reason"?: string | null,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_blocks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "applicant_id": string | null,"cancel_reason": string | null,"cancel_token_hash": string | null,"cancelled_at": string | null,"created_at": string,"email": string,"ends_at": string,"full_name": string,"id": string,"message": string | null,"phone": string,"reminder_sent_at": string | null,"starts_at": string,"status": Database["public"]['Enums']["booking_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "applicant_id"?: string | null,"cancel_reason"?: string | null,"cancel_token_hash"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"email": string,"ends_at": string,"full_name": string,"id"?: string,"message"?: string | null,"phone": string,"reminder_sent_at"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "applicant_id"?: string | null,"cancel_reason"?: string | null,"cancel_token_hash"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"email"?: string,"ends_at"?: string,"full_name"?: string,"id"?: string,"message"?: string | null,"phone"?: string,"reminder_sent_at"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_applicant_id_fkey"
      columns: ["applicant_id"]
isOneToOne: false
      referencedRelation: "applicants"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_levels": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"key": string | null,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"key"?: string | null,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"key"?: string | null,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"commission_rates": {
                  Row: {
                    "amount_cents": number,"level_id": string,"product_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"level_id": string,"product_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"level_id"?: string,"product_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_rates_level_id_fkey"
      columns: ["level_id"]
isOneToOne: false
      referencedRelation: "commission_levels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_rates_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_rates_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"competitions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string | null,"ends_on": string,"id": string,"is_active": boolean,"product_id": string | null,"starts_on": string,"team_id": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_on": string,"id"?: string,"is_active"?: boolean,"product_id"?: string | null,"starts_on": string,"team_id"?: string | null,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_on"?: string,"id"?: string,"is_active"?: boolean,"product_id"?: string | null,"starts_on"?: string,"team_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "competitions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "competitions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "competitions_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"course_access": {
                  Row: {
                    "course_id": string,"created_at": string,"id": string,"is_mandatory": boolean,"role_id": string | null,"team_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"created_at"?: string,"id"?: string,"is_mandatory"?: boolean,"role_id"?: string | null,"team_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"id"?: string,"is_mandatory"?: boolean,"role_id"?: string | null,"team_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_access_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_access_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_access_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_access_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"course_assignments": {
                  Row: {
                    "assigned_at": string,"assigned_by": string | null,"course_id": string,"due_on": string | null,"id": string,"is_mandatory": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"course_id": string,"due_on"?: string | null,"id"?: string,"is_mandatory"?: boolean,"user_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"course_id"?: string,"due_on"?: string | null,"id"?: string,"is_mandatory"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_assignments_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_assignments_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_assignments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"course_modules": {
                  Row: {
                    "course_id": string,"created_at": string,"description": string | null,"id": string,"sort_order": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"sort_order"?: number,"title": string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"sort_order"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_modules_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "cover_path": string | null,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"published_at": string | null,"sort_order": number,"status": Database["public"]['Enums']["course_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"published_at"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["course_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "cover_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"published_at"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["course_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "courses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"document_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"document_permissions": {
                  Row: {
                    "created_at": string,"document_id": string,"id": string,"role_id": string | null,"team_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_id": string,"id"?: string,"role_id"?: string | null,"team_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"document_id"?: string,"id"?: string,"role_id"?: string | null,"team_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_permissions_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_permissions_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_permissions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "category_id": string | null,"created_at": string,"created_by": string | null,"description": string | null,"file_name": string,"id": string,"is_published": boolean,"mime_type": string,"size_bytes": number,"storage_path": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"file_name": string,"id"?: string,"is_published"?: boolean,"mime_type": string,"size_bytes": number,"storage_path": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"file_name"?: string,"id"?: string,"is_published"?: boolean,"mime_type"?: string,"size_bytes"?: number,"storage_path"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "document_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_billing": {
                  Row: {
                    "city": string | null,"commission_level_id": string | null,"customer_number": string | null,"iban": string | null,"postal_code": string | null,"street": string | null,"tax_number": string | null,"updated_at": string,"user_id": string,"vat_id": string | null,"vat_liable": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"commission_level_id"?: string | null,"customer_number"?: string | null,"iban"?: string | null,"postal_code"?: string | null,"street"?: string | null,"tax_number"?: string | null,"updated_at"?: string,"user_id": string,"vat_id"?: string | null,"vat_liable"?: boolean
                  }
                  Update: {
                    "city"?: string | null,"commission_level_id"?: string | null,"customer_number"?: string | null,"iban"?: string | null,"postal_code"?: string | null,"street"?: string | null,"tax_number"?: string | null,"updated_at"?: string,"user_id"?: string,"vat_id"?: string | null,"vat_liable"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_billing_commission_level_id_fkey"
      columns: ["commission_level_id"]
isOneToOne: false
      referencedRelation: "commission_levels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employee_billing_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_details": {
                  Row: {
                    "entry_date": string | null,"partner_status": Database["public"]['Enums']["partner_status"],"phone": string | null,"sales_region": string | null,"sales_start_date": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "entry_date"?: string | null,"partner_status"?: Database["public"]['Enums']["partner_status"],"phone"?: string | null,"sales_region"?: string | null,"sales_start_date"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "entry_date"?: string | null,"partner_status"?: Database["public"]['Enums']["partner_status"],"phone"?: string | null,"sales_region"?: string | null,"sales_start_date"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_details_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_user_id": string | null,"applicant_id": string | null,"created_at": string,"email": string,"expires_at": string,"first_name": string,"id": string,"invited_by": string | null,"last_name": string,"product_ids": (string)[],"revoked_at": string | null,"role_id": string,"supervisor_id": string | null,"team_id": string | null,"token_hash": string,"trainer_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"applicant_id"?: string | null,"created_at"?: string,"email": string,"expires_at": string,"first_name": string,"id"?: string,"invited_by"?: string | null,"last_name": string,"product_ids"?: (string)[],"revoked_at"?: string | null,"role_id": string,"supervisor_id"?: string | null,"team_id"?: string | null,"token_hash": string,"trainer_id"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"applicant_id"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"first_name"?: string,"id"?: string,"invited_by"?: string | null,"last_name"?: string,"product_ids"?: (string)[],"revoked_at"?: string | null,"role_id"?: string,"supervisor_id"?: string | null,"team_id"?: string | null,"token_hash"?: string,"trainer_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_accepted_user_id_fkey"
      columns: ["accepted_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_applicant_fk"
      columns: ["applicant_id"]
isOneToOne: false
      referencedRelation: "applicants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_supervisor_id_fkey"
      columns: ["supervisor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_progress": {
                  Row: {
                    "completed_at": string | null,"completion_source": Database["public"]['Enums']["completion_source"] | null,"confirmed_by": string | null,"lesson_id": string,"note": string | null,"started_at": string,"status": Database["public"]['Enums']["progress_status"],"updated_at": string,"user_id": string,"video_duration_seconds": number | null,"video_position_seconds": number
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"completion_source"?: Database["public"]['Enums']["completion_source"] | null,"confirmed_by"?: string | null,"lesson_id": string,"note"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["progress_status"],"updated_at"?: string,"user_id": string,"video_duration_seconds"?: number | null,"video_position_seconds"?: number
                  }
                  Update: {
                    "completed_at"?: string | null,"completion_source"?: Database["public"]['Enums']["completion_source"] | null,"confirmed_by"?: string | null,"lesson_id"?: string,"note"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["progress_status"],"updated_at"?: string,"user_id"?: string,"video_duration_seconds"?: number | null,"video_position_seconds"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_progress_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_progress_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "content": string | null,"created_at": string,"document_path": string | null,"duration_minutes": number | null,"id": string,"is_published": boolean,"lesson_type": Database["public"]['Enums']["lesson_type"],"min_seconds": number,"module_id": string,"published_at": string | null,"sort_order": number,"title": string,"updated_at": string,"video_path": string | null,"video_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: string | null,"created_at"?: string,"document_path"?: string | null,"duration_minutes"?: number | null,"id"?: string,"is_published"?: boolean,"lesson_type": Database["public"]['Enums']["lesson_type"],"min_seconds"?: number,"module_id": string,"published_at"?: string | null,"sort_order"?: number,"title": string,"updated_at"?: string,"video_path"?: string | null,"video_url"?: string | null
                  }
                  Update: {
                    "content"?: string | null,"created_at"?: string,"document_path"?: string | null,"duration_minutes"?: number | null,"id"?: string,"is_published"?: boolean,"lesson_type"?: Database["public"]['Enums']["lesson_type"],"min_seconds"?: number,"module_id"?: string,"published_at"?: string | null,"sort_order"?: number,"title"?: string,"updated_at"?: string,"video_path"?: string | null,"video_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_module_id_fkey"
      columns: ["module_id"]
isOneToOne: false
      referencedRelation: "course_modules"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"link": string | null,"read_at": string | null,"title": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"link"?: string | null,"read_at"?: string | null,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_settings": {
                  Row: {
                    "description": string | null,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"performance_adjustments": {
                  Row: {
                    "action": string,"actor_id": string | null,"changes": Json | null,"created_at": string,"from_status": Database["public"]['Enums']["performance_status"] | null,"id": string,"reason": string | null,"record_id": string,"replacement_record_id": string | null,"to_status": Database["public"]['Enums']["performance_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["performance_status"] | null,"id"?: string,"reason"?: string | null,"record_id": string,"replacement_record_id"?: string | null,"to_status"?: Database["public"]['Enums']["performance_status"] | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["performance_status"] | null,"id"?: string,"reason"?: string | null,"record_id"?: string,"replacement_record_id"?: string | null,"to_status"?: Database["public"]['Enums']["performance_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "performance_adjustments_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_adjustments_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "performance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_adjustments_replacement_record_id_fkey"
      columns: ["replacement_record_id"]
isOneToOne: false
      referencedRelation: "performance_records"
      referencedColumns: ["id"]
    }
                  ]
                },"performance_approvals": {
                  Row: {
                    "actor_id": string,"comment": string | null,"created_at": string,"decision": string,"id": string,"record_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"comment"?: string | null,"created_at"?: string,"decision": string,"id"?: string,"record_id": string
                  }
                  Update: {
                    "actor_id"?: string,"comment"?: string | null,"created_at"?: string,"decision"?: string,"id"?: string,"record_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "performance_approvals_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_approvals_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "performance_records"
      referencedColumns: ["id"]
    }
                  ]
                },"performance_records": {
                  Row: {
                    "cancelled_at": string | null,"cancelled_by": string | null,"confirmed_at": string | null,"confirmed_by": string | null,"corrects_record_id": string | null,"created_at": string,"created_by": string,"external_ref": string | null,"id": string,"note": string | null,"occurred_on": string,"product_id": string,"quantity": number,"status": Database["public"]['Enums']["performance_status"],"status_reason": string | null,"submitted_at": string | null,"team_id": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"corrects_record_id"?: string | null,"created_at"?: string,"created_by": string,"external_ref"?: string | null,"id"?: string,"note"?: string | null,"occurred_on": string,"product_id": string,"quantity": number,"status"?: Database["public"]['Enums']["performance_status"],"status_reason"?: string | null,"submitted_at"?: string | null,"team_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"corrects_record_id"?: string | null,"created_at"?: string,"created_by"?: string,"external_ref"?: string | null,"id"?: string,"note"?: string | null,"occurred_on"?: string,"product_id"?: string,"quantity"?: number,"status"?: Database["public"]['Enums']["performance_status"],"status_reason"?: string | null,"submitted_at"?: string | null,"team_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "performance_records_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_records_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_records_corrects_record_id_fkey"
      columns: ["corrects_record_id"]
isOneToOne: false
      referencedRelation: "performance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_records_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_records_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_records_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_records_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "category": string,"description": string,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"description": string,"key": string
                  }
                  Update: {
                    "category"?: string,"description"?: string,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"products": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"requires_external_ref": boolean,"sort_order": number,"unit_label": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"requires_external_ref"?: boolean,"sort_order"?: number,"unit_label"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"requires_external_ref"?: boolean,"sort_order"?: number,"unit_label"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "anonymized_at": string | null,"avatar_path": string | null,"created_at": string,"deactivated_at": string | null,"email": string,"employee_number": string,"first_name": string,"id": string,"last_name": string,"role_id": string,"status": Database["public"]['Enums']["user_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymized_at"?: string | null,"avatar_path"?: string | null,"created_at"?: string,"deactivated_at"?: string | null,"email": string,"employee_number"?: string,"first_name": string,"id": string,"last_name": string,"role_id": string,"status"?: Database["public"]['Enums']["user_status"],"updated_at"?: string
                  }
                  Update: {
                    "anonymized_at"?: string | null,"avatar_path"?: string | null,"created_at"?: string,"deactivated_at"?: string | null,"email"?: string,"employee_number"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"role_id"?: string,"status"?: Database["public"]['Enums']["user_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_answers": {
                  Row: {
                    "answer": string,"id": string,"is_correct": boolean,"question_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"id"?: string,"is_correct"?: boolean,"question_id": string,"sort_order"?: number
                  }
                  Update: {
                    "answer"?: string,"id"?: string,"is_correct"?: boolean,"question_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_answers_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "quiz_questions"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_attempts": {
                  Row: {
                    "answers": NonNullable<Json>,"created_at": string,"id": string,"passed": boolean,"quiz_id": string,"score_percent": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers": NonNullable<Json>,"created_at"?: string,"id"?: string,"passed": boolean,"quiz_id": string,"score_percent": number,"user_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"passed"?: boolean,"quiz_id"?: string,"score_percent"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_attempts_quiz_id_fkey"
      columns: ["quiz_id"]
isOneToOne: false
      referencedRelation: "quizzes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quiz_attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_questions": {
                  Row: {
                    "allows_multiple": boolean,"id": string,"question": string,"quiz_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allows_multiple"?: boolean,"id"?: string,"question": string,"quiz_id": string,"sort_order"?: number
                  }
                  Update: {
                    "allows_multiple"?: boolean,"id"?: string,"question"?: string,"quiz_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_questions_quiz_id_fkey"
      columns: ["quiz_id"]
isOneToOne: false
      referencedRelation: "quizzes"
      referencedColumns: ["id"]
    }
                  ]
                },"quizzes": {
                  Row: {
                    "created_at": string,"id": string,"lesson_id": string,"max_attempts": number | null,"pass_percent": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"lesson_id": string,"max_attempts"?: number | null,"pass_percent"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"lesson_id"?: string,"max_attempts"?: number | null,"pass_percent"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "quizzes_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: true
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"reporting_relationships": {
                  Row: {
                    "created_by": string | null,"employee_id": string,"ended_at": string | null,"id": string,"manager_id": string,"relation_type": Database["public"]['Enums']["relationship_type"],"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_by"?: string | null,"employee_id": string,"ended_at"?: string | null,"id"?: string,"manager_id": string,"relation_type": Database["public"]['Enums']["relationship_type"],"started_at"?: string
                  }
                  Update: {
                    "created_by"?: string | null,"employee_id"?: string,"ended_at"?: string | null,"id"?: string,"manager_id"?: string,"relation_type"?: Database["public"]['Enums']["relationship_type"],"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reporting_relationships_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reporting_relationships_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reporting_relationships_manager_id_fkey"
      columns: ["manager_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "created_at": string,"permission_key": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"permission_key": string,"role_id": string
                  }
                  Update: {
                    "created_at"?: string,"permission_key"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"description": string | null,"hierarchy_level": number,"id": string,"key": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"hierarchy_level": number,"id"?: string,"key": string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"hierarchy_level"?: number,"id"?: string,"key"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"statement_extras": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"description": string,"id": string,"is_active": boolean,"note": string | null,"recurring": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by"?: string | null,"description": string,"id"?: string,"is_active"?: boolean,"note"?: string | null,"recurring"?: boolean,"user_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"is_active"?: boolean,"note"?: string | null,"recurring"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "statement_extras_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_extras_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"statement_items": {
                  Row: {
                    "category": string,"description": string,"id": string,"position": number,"product_id": string | null,"quantity": number,"source_statement_id": string | null,"statement_id": string,"total_cents": number,"unit_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"description": string,"id"?: string,"position": number,"product_id"?: string | null,"quantity"?: number,"source_statement_id"?: string | null,"statement_id": string,"total_cents": number,"unit_cents": number
                  }
                  Update: {
                    "category"?: string,"description"?: string,"id"?: string,"position"?: number,"product_id"?: string | null,"quantity"?: number,"source_statement_id"?: string | null,"statement_id"?: string,"total_cents"?: number,"unit_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "statement_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_items_source_statement_id_fkey"
      columns: ["source_statement_id"]
isOneToOne: false
      referencedRelation: "statements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_items_statement_id_fkey"
      columns: ["statement_id"]
isOneToOne: false
      referencedRelation: "statements"
      referencedColumns: ["id"]
    }
                  ]
                },"statements": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deductions_cents": number,"file_name": string | null,"gross_cents": number,"id": string,"is_upload": boolean,"issue_date": string,"kind": Database["public"]['Enums']["statement_kind"],"net_cents": number,"note": string | null,"number": string | null,"period_from": string | null,"period_to": string | null,"published_at": string | null,"recipient": Json | null,"retention_cents": number,"retention_rate": number,"retention_released_by": string | null,"settled_by": string | null,"status": Database["public"]['Enums']["statement_status"],"status_reason": string | null,"storage_path": string | null,"subtotal_cents": number,"title": string,"user_id": string,"vat_cents": number,"vat_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deductions_cents"?: number,"file_name"?: string | null,"gross_cents"?: number,"id"?: string,"is_upload"?: boolean,"issue_date"?: string,"kind": Database["public"]['Enums']["statement_kind"],"net_cents"?: number,"note"?: string | null,"number"?: string | null,"period_from"?: string | null,"period_to"?: string | null,"published_at"?: string | null,"recipient"?: Json | null,"retention_cents"?: number,"retention_rate"?: number,"retention_released_by"?: string | null,"settled_by"?: string | null,"status"?: Database["public"]['Enums']["statement_status"],"status_reason"?: string | null,"storage_path"?: string | null,"subtotal_cents"?: number,"title": string,"user_id": string,"vat_cents"?: number,"vat_rate"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deductions_cents"?: number,"file_name"?: string | null,"gross_cents"?: number,"id"?: string,"is_upload"?: boolean,"issue_date"?: string,"kind"?: Database["public"]['Enums']["statement_kind"],"net_cents"?: number,"note"?: string | null,"number"?: string | null,"period_from"?: string | null,"period_to"?: string | null,"published_at"?: string | null,"recipient"?: Json | null,"retention_cents"?: number,"retention_rate"?: number,"retention_released_by"?: string | null,"settled_by"?: string | null,"status"?: Database["public"]['Enums']["statement_status"],"status_reason"?: string | null,"storage_path"?: string | null,"subtotal_cents"?: number,"title"?: string,"user_id"?: string,"vat_cents"?: number,"vat_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "statements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statements_retention_released_by_fkey"
      columns: ["retention_released_by"]
isOneToOne: false
      referencedRelation: "statements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statements_settled_by_fkey"
      columns: ["settled_by"]
isOneToOne: false
      referencedRelation: "statements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"target_achievements": {
                  Row: {
                    "achieved_at": string,"period_start": string,"target_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "achieved_at"?: string,"period_start": string,"target_id": string
                  }
                  Update: {
                    "achieved_at"?: string,"period_start"?: string,"target_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "target_achievements_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "targets"
      referencedColumns: ["id"]
    }
                  ]
                },"targets": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_on": string,"id": string,"period": Database["public"]['Enums']["target_period"],"product_id": string | null,"scope": Database["public"]['Enums']["target_scope"],"starts_on": string,"target_value": number,"team_id": string | null,"title": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on": string,"id"?: string,"period": Database["public"]['Enums']["target_period"],"product_id"?: string | null,"scope": Database["public"]['Enums']["target_scope"],"starts_on": string,"target_value": number,"team_id"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on"?: string,"id"?: string,"period"?: Database["public"]['Enums']["target_period"],"product_id"?: string | null,"scope"?: Database["public"]['Enums']["target_scope"],"starts_on"?: string,"target_value"?: number,"team_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "targets_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "targets_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "targets_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "targets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"team_memberships": {
                  Row: {
                    "created_by": string | null,"end_reason": string | null,"ended_at": string | null,"id": string,"includes_subteams": boolean,"member_role": Database["public"]['Enums']["team_member_role"],"started_at": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_by"?: string | null,"end_reason"?: string | null,"ended_at"?: string | null,"id"?: string,"includes_subteams"?: boolean,"member_role"?: Database["public"]['Enums']["team_member_role"],"started_at"?: string,"team_id": string,"user_id": string
                  }
                  Update: {
                    "created_by"?: string | null,"end_reason"?: string | null,"ended_at"?: string | null,"id"?: string,"includes_subteams"?: boolean,"member_role"?: Database["public"]['Enums']["team_member_role"],"started_at"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_memberships_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_memberships_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"parent_team_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"parent_team_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"parent_team_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_parent_team_id_fkey"
      columns: ["parent_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"training_notes": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"shared_with_trainee": boolean,"trainee_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"id"?: string,"shared_with_trainee"?: boolean,"trainee_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"shared_with_trainee"?: boolean,"trainee_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "training_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "training_notes_trainee_id_fkey"
      columns: ["trainee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_permissions": {
                  Row: {
                    "created_at": string,"effect": Database["public"]['Enums']["permission_effect"],"granted_by": string | null,"permission_key": string,"reason": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"effect": Database["public"]['Enums']["permission_effect"],"granted_by"?: string | null,"permission_key": string,"reason"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"effect"?: Database["public"]['Enums']["permission_effect"],"granted_by"?: string | null,"permission_key"?: string,"reason"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_permissions_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "user_permissions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_products": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"product_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"product_id": string,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"product_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_products_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_products_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_anonymize_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"admin_remove_user_permission":
{ Args: { "p_permission": string,"p_user": string }; Returns: undefined
                           },
"admin_set_role_permission":
{ Args: { "p_enabled": boolean,"p_permission": string,"p_role_key": string }; Returns: undefined
                           },
"admin_set_user_permission":
{ Args: { "p_effect": Database["public"]['Enums']["permission_effect"],"p_permission": string,"p_reason"?: string,"p_user": string }; Returns: undefined
                           },
"admin_set_user_role":
{ Args: { "p_role_key": string,"p_user": string }; Returns: undefined
                           },
"admin_set_user_status":
{ Args: { "p_status": Database["public"]['Enums']["user_status"],"p_user": string }; Returns: undefined
                           },
"admin_update_employee":
{ Args: { "p_entry_date": string,"p_first_name": string,"p_last_name": string,"p_partner_status": Database["public"]['Enums']["partner_status"],"p_phone": string,"p_sales_region": string,"p_sales_start_date": string,"p_user": string }; Returns: undefined
                           },
"admin_update_setting":
{ Args: { "p_key": string,"p_value": Json }; Returns: undefined
                           },
"announcement_delete":
{ Args: { "p_id": string }; Returns: undefined
                           },
"announcement_upsert":
{ Args: { "p_audience_role_ids": (string)[],"p_body": string,"p_expires_at": string,"p_id": string,"p_is_pinned": boolean,"p_notify"?: boolean,"p_title": string }; Returns: string
                           },
"applicant_delete":
{ Args: { "p_id": string }; Returns: undefined
                           },
"applicant_update":
{ Args: { "p_id": string,"p_notes": string,"p_status": Database["public"]['Enums']["applicant_status"] }; Returns: undefined
                           },
"booking_availability_save":
{ Args: { "p_rows": Json }; Returns: undefined
                           },
"booking_block_add":
{ Args: { "p_ends_at": string,"p_reason": string,"p_starts_at": string }; Returns: string
                           },
"booking_block_delete":
{ Args: { "p_id": string }; Returns: undefined
                           },
"booking_cancel":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"booking_cancel_by_token":
{ Args: { "p_token_hash": string }; Returns: {
              "email": string,"full_name": string,"id": string,"starts_at": string
            }[]
                           },
"booking_claim_reminders":
{ Args: Record<PropertyKey, never>; Returns: {
              "cancel_token_hash": string,"email": string,"ends_at": string,"full_name": string,"id": string,"phone": string,"starts_at": string
            }[]
                           },
"booking_create":
{ Args: { "p_cancel_token_hash": string,"p_email": string,"p_full_name": string,"p_message": string,"p_phone": string,"p_starts_at": string }; Returns: string
                           },
"booking_free_slots":
{ Args: { "p_days"?: number }; Returns: {
              "ends_at": string,"starts_at": string
            }[]
                           },
"booking_lookup_by_token":
{ Args: { "p_token_hash": string }; Returns: {
              "ends_at": string,"full_name": string,"id": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"booking_settings_save":
{ Args: { "p_value": Json }; Returns: undefined
                           },
"bootstrap_admin":
{ Args: { "p_email": string }; Returns: undefined
                           },
"commission_level_upsert":
{ Args: { "p_description": string,"p_id": string,"p_is_active": boolean,"p_name": string,"p_sort_order": number }; Returns: string
                           },
"commission_rate_set":
{ Args: { "p_amount_cents": number,"p_level_key": string,"p_product": string }; Returns: undefined
                           },
"commission_rates_save":
{ Args: { "p_rates": Json }; Returns: undefined
                           },
"commission_settings_save":
{ Args: { "p_overhead_mode": string }; Returns: undefined
                           },
"competition_upsert":
{ Args: { "p_description": string,"p_ends_on": string,"p_id": string,"p_is_active": boolean,"p_product": string,"p_starts_on": string,"p_team": string,"p_title": string }; Returns: string
                           },
"course_assign":
{ Args: { "p_course": string,"p_due_on"?: string,"p_user": string }; Returns: undefined
                           },
"course_delete":
{ Args: { "p_id": string }; Returns: undefined
                           },
"course_set_access":
{ Args: { "p_course": string,"p_entries": Json }; Returns: undefined
                           },
"course_set_cover":
{ Args: { "p_course": string,"p_path": string }; Returns: undefined
                           },
"course_unassign":
{ Args: { "p_course": string,"p_user": string }; Returns: undefined
                           },
"course_upsert":
{ Args: { "p_description": string,"p_id": string,"p_sort_order"?: number,"p_status": Database["public"]['Enums']["course_status"],"p_title": string }; Returns: string
                           },
"customer_number_next_get":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"customer_number_next_set":
{ Args: { "p_next": number }; Returns: undefined
                           },
"document_category_upsert":
{ Args: { "p_id": string,"p_name": string,"p_sort_order"?: number }; Returns: string
                           },
"document_create":
{ Args: { "p_access": Json,"p_category": string,"p_description": string,"p_file_name": string,"p_mime_type": string,"p_size_bytes": number,"p_storage_path": string,"p_title": string }; Returns: string
                           },
"document_delete":
{ Args: { "p_id": string }; Returns: string
                           },
"document_set_access":
{ Args: { "p_access": Json,"p_document": string }; Returns: undefined
                           },
"document_update":
{ Args: { "p_access": Json,"p_category": string,"p_description": string,"p_id": string,"p_is_published": boolean,"p_title": string }; Returns: undefined
                           },
"employee_billing_save":
{ Args: { "p_city": string,"p_iban": string,"p_postal_code": string,"p_street": string,"p_tax_number": string,"p_user": string,"p_vat_id": string,"p_vat_liable": boolean }; Returns: undefined
                           },
"employee_set_commission_level":
{ Args: { "p_level": string,"p_user": string }; Returns: undefined
                           },
"employee_set_customer_number":
{ Args: { "p_number": string,"p_user": string }; Returns: undefined
                           },
"get_leaderboard":
{ Args: { "p_from": string,"p_product_id"?: string,"p_team_id"?: string,"p_to": string }; Returns: {
              "display_name": string,"is_me": boolean,"rank": number,"team_name": string,"total": number,"user_id": string
            }[]
                           },
"get_money_kpis":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "own_commission_cents": number,"revenue_cents": number
            }[]
                           },
"get_profile_history":
{ Args: { "p_limit"?: number,"p_user": string }; Returns: {
              "action": string,"actor_name": string,"new_data": Json,"occurred_at": string,"old_data": Json,"table_name": string
            }[]
                           },
"get_quiz":
{ Args: { "p_lesson": string }; Returns: Json
                           },
"get_target_progress":
{ Args: { "p_day"?: string }; Returns: {
              "actual": number,"period": Database["public"]['Enums']["target_period"],"product_id": string,"scope": Database["public"]['Enums']["target_scope"],"target_id": string,"target_value": number,"team_id": string,"title": string,"user_id": string,"window_end": string,"window_start": string
            }[]
                           },
"get_training_overview":
{ Args: { "p_user"?: string }; Returns: {
              "completed_lessons": number,"course_id": string,"due_on": string,"is_mandatory": boolean,"last_activity": string,"title": string,"total_lessons": number
            }[]
                           },
"gutschrift_suggestion":
{ Args: { "p_from": string,"p_to": string,"p_user": string }; Returns: {
              "amount_cents": number,"description": string,"line": string,"source_id": string
            }[]
                           },
"invitation_accept":
{ Args: { "p_invitation": string,"p_user": string }; Returns: undefined
                           },
"invitation_create":
{ Args: { "p_applicant"?: string,"p_email": string,"p_first_name": string,"p_last_name": string,"p_role_key": string,"p_supervisor": string,"p_team": string,"p_token_hash": string,"p_trainer": string,"p_valid_hours"?: number }; Returns: string
                           },
"invitation_lookup":
{ Args: { "p_token_hash": string }; Returns: {
              "email": string,"expires_at": string,"first_name": string,"id": string,"last_name": string,"role_name": string
            }[]
                           },
"invitation_renew":
{ Args: { "p_id": string,"p_token_hash": string,"p_valid_hours"?: number }; Returns: {
              "email": string,"first_name": string
            }[]
                           },
"invitation_revoke":
{ Args: { "p_id": string }; Returns: undefined
                           },
"invitation_set_products":
{ Args: { "p_id": string,"p_products": (string)[] }; Returns: undefined
                           },
"lesson_complete":
{ Args: { "p_lesson": string }; Returns: undefined
                           },
"lesson_delete":
{ Args: { "p_id": string }; Returns: undefined
                           },
"lesson_set_media":
{ Args: { "p_kind": string,"p_lesson": string,"p_path": string }; Returns: undefined
                           },
"lesson_start":
{ Args: { "p_lesson": string }; Returns: undefined
                           },
"lesson_upsert":
{ Args: { "p_content": string,"p_duration_minutes": number,"p_id": string,"p_is_published": boolean,"p_min_seconds": number,"p_module": string,"p_sort_order": number,"p_title": string,"p_type": Database["public"]['Enums']["lesson_type"],"p_video_url": string }; Returns: string
                           },
"lesson_video_progress":
{ Args: { "p_duration": number,"p_lesson": string,"p_position": number }; Returns: Database["public"]['Enums']["progress_status"]
                           },
"log_export":
{ Args: { "p_filters": Json,"p_kind": string,"p_rows": number }; Returns: undefined
                           },
"module_delete":
{ Args: { "p_id": string }; Returns: undefined
                           },
"module_upsert":
{ Args: { "p_course": string,"p_description": string,"p_id": string,"p_sort_order": number,"p_title": string }; Returns: string
                           },
"my_permissions":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"notifications_mark_read":
{ Args: { "p_ids"?: (string)[] }; Returns: undefined
                           },
"performance_correct":
{ Args: { "p_id": string,"p_occurred_on": string,"p_product": string,"p_quantity": number,"p_reason": string }; Returns: string
                           },
"performance_create":
{ Args: { "p_confirm_duplicate"?: boolean,"p_external_ref"?: string,"p_note"?: string,"p_occurred_on": string,"p_product": string,"p_quantity": number,"p_submit"?: boolean,"p_user": string }; Returns: string
                           },
"performance_daily":
{ Args: { "p_from": string,"p_product_id"?: string,"p_team_id"?: string,"p_to": string,"p_user_ids"?: (string)[] }; Returns: {
              "day": string,"product_id": string,"quantity": number,"records": number,"status": Database["public"]['Enums']["performance_status"],"team_id": string,"user_id": string
            }[]
                           },
"performance_transition":
{ Args: { "p_action": string,"p_id": string,"p_reason"?: string }; Returns: undefined
                           },
"performance_update_draft":
{ Args: { "p_external_ref"?: string,"p_id": string,"p_note"?: string,"p_occurred_on": string,"p_product": string,"p_quantity": number }; Returns: undefined
                           },
"product_upsert":
{ Args: { "p_description": string,"p_id": string,"p_is_active": boolean,"p_name": string,"p_requires_external_ref": boolean,"p_sort_order"?: number,"p_unit_label": string }; Returns: string
                           },
"purge_applicants":
{ Args: { "p_days"?: number }; Returns: number
                           },
"quiz_save":
{ Args: { "p_lesson": string,"p_max_attempts": number,"p_pass_percent": number,"p_questions": Json }; Returns: undefined
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"set_own_avatar":
{ Args: { "p_path": string }; Returns: undefined
                           },
"set_reporting_relationship":
{ Args: { "p_employee": string,"p_manager": string,"p_type": Database["public"]['Enums']["relationship_type"] }; Returns: undefined
                           },
"statement_cancel":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"statement_create":
{ Args: { "p_from": string,"p_issuer_vat_rate"?: number,"p_items": Json,"p_kind": Database["public"]['Enums']["statement_kind"],"p_note": string,"p_retention_rate"?: number,"p_title": string,"p_to": string,"p_user": string }; Returns: string
                           },
"statement_defaults_save":
{ Args: { "p_retention_rate": number }; Returns: undefined
                           },
"statement_delete_draft":
{ Args: { "p_id": string }; Returns: string
                           },
"statement_extra_delete":
{ Args: { "p_id": string }; Returns: undefined
                           },
"statement_extra_upsert":
{ Args: { "p_amount_cents": number,"p_description": string,"p_id": string,"p_is_active": boolean,"p_note": string,"p_recurring": boolean,"p_user": string }; Returns: string
                           },
"statement_numbering_get":
{ Args: Record<PropertyKey, never>; Returns: {
              "example": string,"format": string,"kind": Database["public"]['Enums']["statement_kind"],"next_number": number,"pad": number
            }[]
                           },
"statement_numbering_set":
{ Args: { "p_format": string,"p_kind": Database["public"]['Enums']["statement_kind"],"p_next_number": number,"p_pad": number }; Returns: undefined
                           },
"statement_preview":
{ Args: { "p_from": string,"p_to": string,"p_user": string }; Returns: {
              "has_rate": boolean,"kind": string,"product_id": string,"product_name": string,"quantity": number,"total_cents": number,"unit_cents": number,"unit_label": string
            }[]
                           },
"statement_publish":
{ Args: { "p_file_name": string,"p_id": string,"p_storage_path": string }; Returns: string
                           },
"statement_register_upload":
{ Args: { "p_file_name": string,"p_from": string,"p_gross_cents": number,"p_kind": Database["public"]['Enums']["statement_kind"],"p_note": string,"p_storage_path": string,"p_title": string,"p_to": string,"p_user": string }; Returns: string
                           },
"statement_set_file":
{ Args: { "p_file_name": string,"p_id": string,"p_storage_path": string }; Returns: undefined
                           },
"submit_quiz":
{ Args: { "p_answers": Json,"p_lesson": string }; Returns: Json
                           },
"target_delete":
{ Args: { "p_id": string }; Returns: undefined
                           },
"target_upsert":
{ Args: { "p_ends_on": string,"p_id": string,"p_period": Database["public"]['Enums']["target_period"],"p_product": string,"p_scope": Database["public"]['Enums']["target_scope"],"p_starts_on": string,"p_target_value": number,"p_team": string,"p_title": string,"p_user": string }; Returns: string
                           },
"team_assign_member":
{ Args: { "p_includes_subteams"?: boolean,"p_member_role"?: Database["public"]['Enums']["team_member_role"],"p_team": string,"p_user": string }; Returns: string
                           },
"team_end_membership":
{ Args: { "p_membership": string,"p_reason"?: string }; Returns: undefined
                           },
"team_upsert":
{ Args: { "p_description": string,"p_id": string,"p_is_active"?: boolean,"p_name": string,"p_parent_team_id": string }; Returns: string
                           },
"trainer_set_lesson_progress":
{ Args: { "p_lesson": string,"p_note"?: string,"p_status": Database["public"]['Enums']["progress_status"],"p_user": string }; Returns: undefined
                           },
"training_note_add":
{ Args: { "p_body": string,"p_shared"?: boolean,"p_trainee": string }; Returns: string
                           },
"update_own_profile":
{ Args: { "p_phone": string }; Returns: undefined
                           },
"user_products_set":
{ Args: { "p_products": (string)[],"p_user": string }; Returns: undefined
                           }
          }
          Enums: {
            "applicant_status": "neu"|"kontaktiert"|"gespraech"|"angenommen"|"abgelehnt","booking_status": "gebucht"|"storniert","completion_source": "selbst"|"video"|"quiz"|"ausbilder","course_status": "entwurf"|"veroeffentlicht"|"archiviert","lesson_type": "text"|"video"|"dokument"|"quiz","partner_status": "in_ausbildung"|"aktiv"|"pausiert"|"beendet","performance_status": "entwurf"|"eingereicht"|"bestaetigt"|"abgelehnt"|"storniert"|"korrigiert","permission_effect": "grant"|"deny","progress_status": "nicht_begonnen"|"in_bearbeitung"|"abgeschlossen","relationship_type": "vorgesetzter"|"ausbilder","statement_kind": "abrechnung"|"gutschrift","statement_status": "entwurf"|"veroeffentlicht"|"storniert","target_period": "tag"|"woche"|"monat"|"zeitraum","target_scope": "mitarbeiter"|"team"|"agentur","team_member_role": "mitglied"|"teamleiter","user_status": "eingeladen"|"aktiv"|"deaktiviert"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "applicant_status": ["neu", "kontaktiert", "gespraech", "angenommen", "abgelehnt"],"booking_status": ["gebucht", "storniert"],"completion_source": ["selbst", "video", "quiz", "ausbilder"],"course_status": ["entwurf", "veroeffentlicht", "archiviert"],"lesson_type": ["text", "video", "dokument", "quiz"],"partner_status": ["in_ausbildung", "aktiv", "pausiert", "beendet"],"performance_status": ["entwurf", "eingereicht", "bestaetigt", "abgelehnt", "storniert", "korrigiert"],"permission_effect": ["grant", "deny"],"progress_status": ["nicht_begonnen", "in_bearbeitung", "abgeschlossen"],"relationship_type": ["vorgesetzter", "ausbilder"],"statement_kind": ["abrechnung", "gutschrift"],"statement_status": ["entwurf", "veroeffentlicht", "storniert"],"target_period": ["tag", "woche", "monat", "zeitraum"],"target_scope": ["mitarbeiter", "team", "agentur"],"team_member_role": ["mitglied", "teamleiter"],"user_status": ["eingeladen", "aktiv", "deaktiviert"]
          }
        }
} as const
