CREATE SCHEMA "adoption";
--> statement-breakpoint
CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE SCHEMA "provider";
--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'SHORTLISTED', 'MEETING_SCHEDULED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."meeting_kind" AS ENUM('MEET_AND_GREET', 'HOME_VISIT', 'VIDEO_CALL');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('PROPOSED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."energy_level" AS ENUM('LOW', 'MODERATE', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'PAUSED', 'RESERVED', 'ADOPTED', 'REJECTED', 'EXPIRED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('IMAGE', 'VIDEO', 'DOCUMENT');--> statement-breakpoint
CREATE TYPE "public"."pet_sex" AS ENUM('MALE', 'FEMALE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."pet_size" AS ENUM('SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE');--> statement-breakpoint
CREATE TYPE "public"."tri_state" AS ENUM('YES', 'NO', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('NORMAL', 'ELEVATED', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."vaccination_status" AS ENUM('NONE', 'PARTIAL', 'UP_TO_DATE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('IOS', 'ANDROID', 'WEB', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'ne');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADOPTER', 'PET_OWNER', 'ORGANIZATION', 'VETERINARIAN', 'PET_SHOP', 'MODERATOR', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('GOOGLE', 'APPLE');--> statement-breakpoint
CREATE TYPE "public"."security_event" AS ENUM('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'TOKEN_REFRESHED', 'REFRESH_REPLAY_DETECTED', 'SESSION_REVOKED', 'ACCOUNT_LOCKED', 'ROLE_GRANTED', 'EMAIL_VERIFIED', 'PHONE_VERIFIED');--> statement-breakpoint
CREATE TYPE "public"."verification_purpose" AS ENUM('EMAIL_VERIFICATION', 'PHONE_VERIFICATION', 'PASSWORD_RESET', 'TWO_FACTOR');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."provider_kind" AS ENUM('CLINIC', 'SHOP');--> statement-breakpoint
CREATE TYPE "public"."service_category" AS ENUM('CONSULTATION', 'VACCINATION', 'SURGERY', 'DIAGNOSTICS', 'GROOMING', 'BOARDING', 'TRAINING', 'EMERGENCY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "adoption"."adoptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"adopter_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adoption"."application_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status" NOT NULL,
	"changed_by" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adoption"."applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"pet_name" text NOT NULL,
	"applicant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"organization_id" uuid,
	"status" "application_status" DEFAULT 'SUBMITTED' NOT NULL,
	"message" text NOT NULL,
	"housing_type" text NOT NULL,
	"owns_home" text NOT NULL,
	"has_yard" text NOT NULL,
	"household_size" integer NOT NULL,
	"has_children" text NOT NULL,
	"youngest_child_age" integer,
	"existing_pets" text,
	"hours_alone_per_day" integer NOT NULL,
	"previous_pet_experience" text,
	"custom_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_notes" text,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adoption"."meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "meeting_kind" DEFAULT 'MEET_AND_GREET' NOT NULL,
	"status" "meeting_status" DEFAULT 'PROPOSED' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"location_text" text,
	"notes" text,
	"proposed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adoption"."reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "adoption"."reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"is_hidden" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."breeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ne" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."pet_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"kind" "media_kind" DEFAULT 'IMAGE' NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."pet_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"from_status" "listing_status",
	"to_status" "listing_status" NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"species_id" uuid NOT NULL,
	"breed_id" uuid,
	"is_mixed_breed" boolean DEFAULT false NOT NULL,
	"sex" "pet_sex" NOT NULL,
	"date_of_birth" timestamp with time zone,
	"estimated_age_months" integer,
	"size" "pet_size",
	"weight_kg" numeric(6, 2),
	"color" text,
	"coat_type" text,
	"description" text NOT NULL,
	"rescue_story" text,
	"country" text DEFAULT 'NP' NOT NULL,
	"province" text,
	"district" text,
	"municipality" text,
	"area" text,
	"latitude" double precision,
	"longitude" double precision,
	"adoption_radius_km" integer DEFAULT 50 NOT NULL,
	"adoption_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"adoption_requirements" text,
	"urgency" "urgency" DEFAULT 'NORMAL' NOT NULL,
	"vaccination_status" "vaccination_status" DEFAULT 'UNKNOWN' NOT NULL,
	"sterilized" "tri_state" DEFAULT 'UNKNOWN' NOT NULL,
	"microchipped" "tri_state" DEFAULT 'UNKNOWN' NOT NULL,
	"dewormed" "tri_state" DEFAULT 'UNKNOWN' NOT NULL,
	"special_needs" boolean DEFAULT false NOT NULL,
	"disability_info" text,
	"medical_conditions" text,
	"personality" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"energy_level" "energy_level" DEFAULT 'MODERATE' NOT NULL,
	"house_trained" "tri_state" DEFAULT 'UNKNOWN' NOT NULL,
	"good_with_children" "tri_state" DEFAULT 'UNKNOWN' NOT NULL,
	"good_with_dogs" "tri_state" DEFAULT 'UNKNOWN' NOT NULL,
	"good_with_cats" "tri_state" DEFAULT 'UNKNOWN' NOT NULL,
	"training_notes" text,
	"status" "listing_status" DEFAULT 'DRAFT' NOT NULL,
	"rejection_reason" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"favorite_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalog"."species" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ne" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "species_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "identity"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"device_platform" "device_platform" DEFAULT 'UNKNOWN' NOT NULL,
	"device_name" text,
	"device_id" text,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"rotated_to_id" uuid
);
--> statement-breakpoint
CREATE TABLE "identity"."notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"new_application_alerts" boolean DEFAULT true NOT NULL,
	"message_alerts" boolean DEFAULT true NOT NULL,
	"appointment_reminders" boolean DEFAULT true NOT NULL,
	"marketing_emails" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "identity"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"password_hash" text,
	"full_name" text NOT NULL,
	"avatar_url" text,
	"bio" text,
	"preferred_language" "language" DEFAULT 'en' NOT NULL,
	"country" text DEFAULT 'NP' NOT NULL,
	"province" text,
	"district" text,
	"municipality" text,
	"area" text,
	"latitude" double precision,
	"longitude" double precision,
	"status" "account_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_secret" text,
	"terms_accepted_at" timestamp with time zone,
	"privacy_accepted_at" timestamp with time zone,
	"accepted_terms_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "identity"."oauth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event" "security_event" NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "verification_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"destination" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider"."appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"practitioner_id" uuid,
	"customer_id" uuid NOT NULL,
	"pet_id" uuid,
	"pet_name" text,
	"status" "appointment_status" DEFAULT 'REQUESTED' NOT NULL,
	"requested_for" timestamp with time zone NOT NULL,
	"confirmed_for" timestamp with time zone,
	"notes" text,
	"practitioner_notes" text,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider"."branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"province" text,
	"district" text,
	"municipality" text,
	"area" text,
	"latitude" double precision,
	"longitude" double precision,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider"."opening_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"branch_id" uuid,
	"weekday" integer NOT NULL,
	"opens_at" text NOT NULL,
	"closes_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider"."practitioners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"qualification" text,
	"license_number" text,
	"specialization" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider"."providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"registration_number" text,
	"phone" text NOT NULL,
	"email" text,
	"website" text,
	"country" text DEFAULT 'NP' NOT NULL,
	"province" text,
	"district" text,
	"municipality" text,
	"area" text,
	"latitude" double precision,
	"longitude" double precision,
	"emergency_available" boolean DEFAULT false NOT NULL,
	"emergency_phone" text,
	"verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"rejection_reason" text,
	"rating_average" numeric(3, 2) DEFAULT '0' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider"."services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "service_category" NOT NULL,
	"description" text,
	"price_min" numeric(10, 2),
	"price_max" numeric(10, 2),
	"currency" text DEFAULT 'NPR' NOT NULL,
	"duration_minutes" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider"."verification_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"url" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "adoption"."adoptions" ADD CONSTRAINT "adoptions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "adoption"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption"."application_status_history" ADD CONSTRAINT "application_status_history_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "adoption"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption"."meetings" ADD CONSTRAINT "meetings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "adoption"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."breeds" ADD CONSTRAINT "breeds_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "catalog"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."favorites" ADD CONSTRAINT "favorites_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "catalog"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."pet_media" ADD CONSTRAINT "pet_media_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "catalog"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."pet_status_history" ADD CONSTRAINT "pet_status_history_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "catalog"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."pets" ADD CONSTRAINT "pets_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "catalog"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."pets" ADD CONSTRAINT "pets_breed_id_breeds_id_fk" FOREIGN KEY ("breed_id") REFERENCES "catalog"."breeds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."appointments" ADD CONSTRAINT "appointments_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "provider"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."appointments" ADD CONSTRAINT "appointments_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "provider"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."branches" ADD CONSTRAINT "branches_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."opening_hours" ADD CONSTRAINT "opening_hours_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."opening_hours" ADD CONSTRAINT "opening_hours_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "provider"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."practitioners" ADD CONSTRAINT "practitioners_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."services" ADD CONSTRAINT "services_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider"."verification_documents" ADD CONSTRAINT "verification_documents_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "adoptions_application_unique" ON "adoption"."adoptions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "adoptions_pet_idx" ON "adoption"."adoptions" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "adoptions_adopter_idx" ON "adoption"."adoptions" USING btree ("adopter_id");--> statement-breakpoint
CREATE INDEX "application_history_idx" ON "adoption"."application_status_history" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_applicant_pet_unique" ON "adoption"."applications" USING btree ("applicant_id","pet_id");--> statement-breakpoint
CREATE INDEX "applications_owner_queue_idx" ON "adoption"."applications" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "applications_applicant_idx" ON "adoption"."applications" USING btree ("applicant_id","status");--> statement-breakpoint
CREATE INDEX "applications_pet_idx" ON "adoption"."applications" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "meetings_application_idx" ON "adoption"."meetings" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "meetings_schedule_idx" ON "adoption"."meetings" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "adoption"."reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "adoption"."reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_author_source_unique" ON "adoption"."reviews" USING btree ("author_id","source_id");--> statement-breakpoint
CREATE INDEX "reviews_subject_idx" ON "adoption"."reviews" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "breeds_species_slug_unique" ON "catalog"."breeds" USING btree ("species_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_unique" ON "catalog"."favorites" USING btree ("user_id","pet_id");--> statement-breakpoint
CREATE INDEX "favorites_user_idx" ON "catalog"."favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pet_media_pet_idx" ON "catalog"."pet_media" USING btree ("pet_id","position");--> statement-breakpoint
CREATE INDEX "pet_status_history_pet_idx" ON "catalog"."pet_status_history" USING btree ("pet_id","created_at");--> statement-breakpoint
CREATE INDEX "pets_owner_idx" ON "catalog"."pets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "pets_species_idx" ON "catalog"."pets" USING btree ("species_id");--> statement-breakpoint
CREATE INDEX "pets_discovery_idx" ON "catalog"."pets" USING btree ("status","published_at") WHERE "catalog"."pets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "pets_location_idx" ON "catalog"."pets" USING btree ("province","district");--> statement-breakpoint
CREATE INDEX "pets_geo_idx" ON "catalog"."pets" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "pets_urgency_idx" ON "catalog"."pets" USING btree ("urgency");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_hash_unique" ON "identity"."sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "identity"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "identity"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_unique" ON "identity"."user_roles" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "identity"."user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "identity"."users" USING btree ("email") WHERE "identity"."users"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "identity"."users" USING btree ("phone") WHERE "identity"."users"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "identity"."users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_location_idx" ON "identity"."users" USING btree ("province","district");--> statement-breakpoint
CREATE INDEX "oauth_identities_provider_idx" ON "identity"."oauth_identities" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "oauth_identities_user_idx" ON "identity"."oauth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "identity"."security_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "security_events_type_idx" ON "identity"."security_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX "verification_tokens_lookup_idx" ON "identity"."verification_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "verification_tokens_hash_idx" ON "identity"."verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_tokens_expiry_idx" ON "identity"."verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "appointments_provider_queue_idx" ON "provider"."appointments" USING btree ("provider_id","status");--> statement-breakpoint
CREATE INDEX "appointments_customer_idx" ON "provider"."appointments" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "appointments_schedule_idx" ON "provider"."appointments" USING btree ("requested_for");--> statement-breakpoint
CREATE INDEX "branches_provider_idx" ON "provider"."branches" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_hours_unique" ON "provider"."opening_hours" USING btree ("provider_id","branch_id","weekday");--> statement-breakpoint
CREATE INDEX "practitioners_provider_idx" ON "provider"."practitioners" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "providers_owner_idx" ON "provider"."providers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "providers_kind_status_idx" ON "provider"."providers" USING btree ("kind","verification_status");--> statement-breakpoint
CREATE INDEX "providers_location_idx" ON "provider"."providers" USING btree ("province","district");--> statement-breakpoint
CREATE INDEX "providers_geo_idx" ON "provider"."providers" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "services_provider_idx" ON "provider"."services" USING btree ("provider_id","is_active");--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "provider"."services" USING btree ("category");--> statement-breakpoint
CREATE INDEX "verification_documents_provider_idx" ON "provider"."verification_documents" USING btree ("provider_id");