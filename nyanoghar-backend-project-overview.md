# Nyanoghar Backend — Project Overview

> A Fastify-based backend specification for a Nepal-focused pet adoption and pet-care platform inspired by the **Nyanoghar UI/UX case study** and expanded into a full Petfinder-style product.

---

## 1. Project Summary

**Nyanoghar** is a community-driven mobile platform that helps people safely adopt, rehome, and care for pets.

The original Nyanoghar concept brings pet adoption listings, direct messaging, veterinary-service discovery, and pet-shop discovery into one application. This backend expands that idea into a complete platform where:

- **Adopters** can discover pets, save favorites, communicate with owners, and submit adoption applications.
- **Pet owners and rescue organizations** can create pet listings, screen applicants, arrange meetings, and complete adoptions.
- **Veterinarians and veterinary clinics** can maintain verified profiles, list services, manage availability, and receive appointment requests.
- **Pet shops** can maintain business profiles, publish products and services, and receive customer inquiries.
- **Administrators and moderators** can verify providers, review reports, moderate content, and maintain platform safety.

The backend will expose REST APIs and real-time communication services for mobile and web clients.

---

## 2. Project Vision

To build a trusted digital ecosystem in Nepal where people can:

1. Find suitable pets for adoption.
2. Rehome pets responsibly.
3. Communicate safely with pet owners and organizations.
4. Locate trusted veterinary clinics.
5. Discover nearby pet-care shops and services.
6. Access reliable pet-care information from one platform.

---

## 3. Problem Statement

Pet adoption and pet-care information is often scattered across social media pages, informal groups, individual contacts, and physical locations.

This creates several problems:

- Adopters cannot easily find suitable and currently available pets.
- Pet listings may contain incomplete or false information.
- Owners receive unstructured messages and cannot properly screen applicants.
- Users cannot easily verify whether a veterinarian, clinic, shop, owner, or rescue organization is trustworthy.
- Adoption applications, meetings, and final decisions are difficult to track.
- There is no central adoption history or reliable status for a listed pet.
- Veterinary clinics and pet shops are difficult to discover by location, service, and availability.
- Fraud, unsafe rehoming, duplicate listings, and animal-welfare concerns are difficult to report and manage.

Nyanoghar solves these problems through structured listings, verified profiles, adoption workflows, messaging, moderation, and location-based discovery.

---

## 4. Product Goals

### Primary goals

- Make pet discovery simple and location-aware.
- Create a structured and traceable adoption process.
- Improve trust between adopters and pet owners.
- Prevent outdated, duplicate, or misleading pet listings.
- Allow users to find verified vets, clinics, and shops.
- Protect user privacy and platform safety.
- Give administrators effective moderation and verification tools.

### Secondary goals

- Support rescue organizations and shelters.
- Support pet fostering and temporary care.
- Share pet-care articles and educational resources.
- Send reminders for applications, appointments, vaccines, and follow-ups.
- Collect platform analytics for improving adoption success.

---

## 5. Target Market

The initial target market is **Nepal**, with support for:

- Nepalese provinces, districts, municipalities, and local areas.
- Location-based search using latitude and longitude.
- Nepali and English content.
- Nepalese phone-number verification.
- Local veterinary clinics, rescue groups, pet owners, and pet shops.

The system should be designed so it can later support additional countries, currencies, languages, and regional rules.

---

## 6. User Roles

## 6.1 Adopter

An adopter is a user searching for a pet.

### Main capabilities

- Register and verify an account.
- Complete an adopter profile.
- Search and filter pets.
- View complete pet details.
- Save pets to favorites.
- Follow owners or organizations.
- Ask questions through chat.
- Submit an adoption application.
- Upload supporting documents when required.
- Track application status.
- Schedule a meeting or home visit.
- Withdraw an application.
- Review the adoption provider after completion.
- Report suspicious users or listings.
- Find vets and pet shops.
- Request veterinary appointments.

---

## 6.2 Pet Owner

A pet owner is an individual rehoming a pet.

### Main capabilities

- Create and verify an account.
- Create, edit, pause, and remove pet listings.
- Upload pet photos, videos, and documents.
- Add vaccination and medical information.
- Define adoption requirements.
- Receive adopter inquiries.
- Receive and review applications.
- Shortlist, approve, reject, or request more information.
- Schedule meetings with applicants.
- Mark a pet as reserved or adopted.
- Maintain an adoption history.
- Report abusive or suspicious users.
- Receive reminders about inactive listings.

---

## 6.3 Shelter or Rescue Organization

A shelter or rescue can use an organization account or an extended owner account.

### Main capabilities

- Create an organization profile.
- Invite staff members.
- Assign staff permissions.
- Manage multiple pets.
- Manage foster homes.
- Create organization-specific adoption forms.
- Review adoption applications as a team.
- Publish adoption policies.
- Track intake, foster, reserved, and adopted animals.
- Display contact information, working hours, and location.
- Receive donations or sponsorships in a later phase.

---

## 6.4 Veterinarian or Veterinary Clinic

A veterinarian or clinic provides medical services.

### Main capabilities

- Create a professional or clinic profile.
- Submit credentials for verification.
- Add clinic branches and locations.
- Add services, prices, hours, and emergency availability.
- Manage doctors or clinic staff.
- Receive appointment requests.
- Accept, reschedule, or reject appointments.
- Maintain appointment notes when permitted.
- Receive ratings and reviews.
- Respond to customer inquiries.
- Publish pet-care articles in a later phase.

> The platform is not intended to replace professional veterinary diagnosis. Medical information should be protected and access-controlled.

---

## 6.5 Pet Shop

A pet shop provides pet products or related services.

### Main capabilities

- Create and verify a business profile.
- Add one or more branches.
- Add opening hours and contact details.
- Add product categories and product listings.
- Add services such as grooming, boarding, or training.
- Receive inquiries and service requests.
- Publish promotions.
- Receive ratings and reviews.
- Manage business staff.

The first release may support discovery and inquiries only. Full ordering, payment, inventory, and delivery can be added later.

---

## 6.6 Administrator and Moderator

Administrators operate and protect the platform.

### Main capabilities

- Manage users and roles.
- Verify owners, organizations, veterinarians, clinics, and shops.
- Review identity and professional documents.
- Approve or reject business profiles.
- Moderate pet listings, reviews, chats, articles, and media.
- Investigate user reports.
- Suspend or ban users.
- Remove unsafe or fraudulent content.
- Manage species, breeds, locations, services, and platform settings.
- View audit logs.
- Monitor adoption and engagement analytics.
- Send announcements and system notifications.

---

## 7. Core Functional Modules

## 7.1 Authentication and Account Management

The system should support:

- Email and password registration.
- Phone-number registration and OTP verification.
- Google and Apple sign-in.
- Access tokens and refresh-token rotation.
- Password reset.
- Device and session management.
- Account deletion.
- Email and phone verification.
- Optional two-factor authentication.
- Role assignment and role upgrades.
- Terms and privacy-policy acceptance tracking.
- Login attempt and security-event tracking.

### Suggested token strategy

- Short-lived JWT access token.
- Long-lived rotating refresh token.
- Refresh tokens stored as hashes.
- Ability to revoke a single device or all sessions.
- Separate verification tokens for email, phone, and password reset.

---

## 7.2 User Profiles

A common user profile may contain:

- Full name.
- Profile image.
- Phone number.
- Email.
- Date joined.
- Preferred language.
- Province, district, municipality, and address area.
- Geographic coordinates.
- Bio.
- Verification status.
- Account status.
- Notification preferences.
- Privacy settings.

Role-specific information should be stored separately from the common user record.

---

## 7.3 Pet Listing Management

Owners and organizations can publish structured pet profiles.

### Pet information

- Name.
- Species.
- Breed or mixed breed.
- Sex.
- Date of birth or estimated age.
- Size.
- Weight.
- Color.
- Coat type.
- Current location.
- Adoption radius.
- Description.
- Personality and temperament.
- Energy level.
- Training status.
- House-trained status.
- Good with children.
- Good with dogs.
- Good with cats.
- Special needs.
- Disability information.
- Medical conditions.
- Vaccination status.
- Sterilization status.
- Microchip status.
- Deworming status.
- Rescue story.
- Adoption fee, when applicable.
- Adoption requirements.
- Urgency level.
- Media gallery.
- Supporting documents.

### Listing statuses

```text
DRAFT
PENDING_REVIEW
PUBLISHED
PAUSED
RESERVED
ADOPTED
REJECTED
EXPIRED
REMOVED
```

Only approved and published listings should appear in public search.

---

## 7.4 Pet Search and Discovery

Users should be able to search by:

- Keyword.
- Species.
- Breed.
- Age group.
- Sex.
- Size.
- Location.
- Distance radius.
- Vaccination status.
- Sterilization status.
- Special-needs status.
- Compatibility with children, cats, or dogs.
- Adoption fee.
- Organization or individual owner.
- Recently added.
- Urgent adoption.
- Most relevant.
- Nearest location.

### Search requirements

- Pagination or cursor-based pagination.
- Full-text search.
- Geographic distance queries.
- Filter combinations.
- Sort options.
- Search history.
- Recently viewed pets.
- Recommended pets.
- Similar-pet suggestions.
- Saved searches.
- Notifications when matching pets are added.

PostgreSQL full-text search may support the first version. OpenSearch or Elasticsearch can be introduced when search volume and ranking requirements grow.

---

## 7.5 Favorites and Saved Searches

Adopters can:

- Add or remove favorite pets.
- Organize favorites.
- Save a search with selected filters.
- Enable alerts for saved searches.
- View recently viewed listings.
- Receive notifications when a favorite pet is reserved or adopted.

---

## 7.6 Adoption Application System

The adoption workflow is a central part of the backend.

### Application information

- Applicant details.
- Household information.
- Housing type.
- Home ownership or rental status.
- Landlord permission.
- Number of household members.
- Children in the household.
- Existing pets.
- Previous pet experience.
- Work schedule.
- Reason for adoption.
- Planned pet-care arrangements.
- References.
- Uploaded documents.
- Consent and declarations.
- Answers to owner-specific questions.

### Application statuses

```text
DRAFT
SUBMITTED
UNDER_REVIEW
MORE_INFORMATION_REQUIRED
SHORTLISTED
MEETING_SCHEDULED
HOME_VISIT_SCHEDULED
APPROVED
REJECTED
WITHDRAWN
EXPIRED
COMPLETED
```

### Rules

- An adopter cannot submit duplicate active applications for the same pet.
- Owners cannot approve multiple final adopters for one pet.
- Status changes must be recorded in an audit-friendly history.
- Rejection reasons may be private or visible depending on platform policy.
- The pet listing should automatically become `RESERVED` after final approval.
- The pet should become `ADOPTED` only after both sides confirm completion or an administrator resolves the case.

---

## 7.7 Adoption Meeting and Scheduling

The platform can support:

- Meet-and-greet requests.
- Phone or video call scheduling.
- Physical meeting scheduling.
- Home-visit scheduling.
- Rescheduling and cancellation.
- Meeting reminders.
- Location sharing with privacy protection.
- Meeting notes.
- Completion confirmation.

For user safety, exact private addresses should not be publicly exposed. They should only be shared after consent and at the appropriate workflow stage.

---

## 7.8 Adoption Completion and Follow-up

After adoption:

- Both parties confirm completion.
- The system records the adoption date.
- The pet listing is closed.
- Other active applications are automatically closed.
- The adopter may receive care reminders.
- The owner or organization may schedule follow-up checks.
- Both parties may submit reviews.
- Administrators can view the adoption trail during disputes.
- The adopter may optionally transfer the pet into a personal “My Pets” profile.

---

## 7.9 Messaging and Real-Time Communication

The system should support direct communication between authorized users.

### Features

- One-to-one conversations.
- Conversation linked to a pet, application, clinic, or shop.
- Text messages.
- Image and document attachments.
- Read receipts.
- Typing indicators.
- Online presence, when enabled.
- Message delivery status.
- Conversation blocking.
- Message reporting.
- Push notifications.
- Moderation metadata.
- Soft deletion.
- Rate limits and spam protection.

### Suggested implementation

- Fastify REST endpoints for conversation history.
- WebSocket or Socket.IO for real-time delivery.
- Redis for presence, pub/sub, and horizontal scaling.
- Object storage for attachments.

Users should not be allowed to start unlimited unsolicited conversations. A conversation may require a pet inquiry, application, appointment, or accepted request.

---

## 7.10 Veterinary Discovery

Users can search for vets or clinics by:

- Name.
- Location.
- Distance.
- Service.
- Animal type.
- Emergency availability.
- Opening status.
- Rating.
- Verified status.
- Home-visit availability.
- Online-consultation availability.

### Clinic information

- Business name.
- Logo and gallery.
- Description.
- Registration details.
- Verification documents.
- Phone and email.
- Address and map coordinates.
- Branches.
- Opening hours.
- Emergency hours.
- Services.
- Prices or price ranges.
- Veterinarians.
- Accepted pet types.
- Facilities.
- Ratings and reviews.

---

## 7.11 Veterinary Appointment Requests

### Appointment workflow

```text
REQUESTED
CONFIRMED
RESCHEDULE_REQUESTED
RESCHEDULED
CANCELLED_BY_USER
CANCELLED_BY_CLINIC
COMPLETED
NO_SHOW
```

### Appointment capabilities

- Choose clinic, branch, service, vet, pet, date, and preferred time.
- Add symptoms or reason for visit.
- Attach relevant documents.
- Clinic accepts, rejects, or proposes another time.
- User confirms a rescheduled time.
- System sends reminders.
- User and clinic can review each other after completion, subject to policy.

The initial version may use appointment requests rather than complex real-time calendar slots.

---

## 7.12 Pet Shop and Service Discovery

Users can discover:

- Pet-food stores.
- Accessory shops.
- Grooming services.
- Boarding services.
- Trainers.
- Walkers.
- Pet transportation.
- Pharmacies, where legally permitted.
- Other pet-care providers.

### Shop information

- Business profile.
- Branches.
- Geographic location.
- Opening hours.
- Contact details.
- Product categories.
- Product listings.
- Service listings.
- Promotions.
- Ratings and reviews.
- Verification status.

### Optional marketplace phase

A future commerce module may include:

- Shopping cart.
- Inventory.
- Orders.
- Online payments.
- Cash on delivery.
- Delivery tracking.
- Refunds and cancellations.
- Coupons.
- Seller settlement.

Marketplace functionality should remain separate from the adoption domain so it can be added without complicating the initial launch.

---

## 7.13 Ratings and Reviews

Reviews may be created for:

- Owners or organizations.
- Veterinary clinics.
- Veterinarians.
- Pet shops.
- Completed services.
- Completed adoptions.

### Review rules

- Only users with a valid completed interaction can review.
- One review per completed transaction or adoption.
- Reviews can include rating, text, and optional media.
- Businesses can respond.
- Users can report reviews.
- Administrators can hide or remove abusive reviews.
- Review edits should be tracked.

---

## 7.14 Verification and Trust

The platform should support several verification levels.

### User verification

- Email verified.
- Phone verified.
- Identity verified.
- Address verified, when necessary.

### Provider verification

- Owner identity.
- Organization registration.
- Veterinary professional credentials.
- Clinic registration.
- Shop registration.
- Business address.
- Bank or payment details in future commerce phases.

### Verification statuses

```text
NOT_SUBMITTED
PENDING
MORE_INFORMATION_REQUIRED
VERIFIED
REJECTED
EXPIRED
REVOKED
```

Sensitive verification documents must be stored privately and must never use public object-storage URLs.

---

## 7.15 Reporting, Blocking, and Moderation

Users should be able to report:

- A pet listing.
- A user.
- A conversation or message.
- A review.
- A clinic or veterinarian.
- A pet shop.
- Animal abuse or welfare concerns.
- Fraud or impersonation.
- Illegal sale attempts.
- Spam.
- Incorrect information.

### Report workflow

```text
OPEN
UNDER_REVIEW
ACTION_REQUIRED
RESOLVED
DISMISSED
ESCALATED
```

### Moderation actions

- Warn user.
- Hide content.
- Remove content.
- Pause listing.
- Request corrections.
- Restrict messaging.
- Temporarily suspend account.
- Permanently ban account.
- Revoke verification.
- Preserve evidence for investigation.

Every moderation action should create an audit log.

---

## 7.16 Notifications

Notification channels may include:

- In-app notifications.
- Push notifications through Firebase Cloud Messaging and APNs.
- Email.
- SMS for critical verification or appointment events.

### Notification events

- Account verification.
- Listing approval or rejection.
- New inquiry.
- New message.
- New adoption application.
- Application status change.
- Meeting reminder.
- Adoption completion.
- Favorite-pet status change.
- Saved-search match.
- Appointment update.
- Provider verification update.
- Review received.
- Report decision.
- Security alert.

Users should be able to configure non-essential notification preferences.

---

## 7.17 Content and Education

The platform may include:

- Pet-care articles.
- Adoption guides.
- Vaccination guides.
- New-adopter checklists.
- Breed information.
- Lost-and-found guidance.
- Emergency contact information.
- Frequently asked questions.

Content may be created by administrators or verified veterinary contributors.

---

## 7.18 Administration Dashboard

The admin backend should provide APIs for a web dashboard covering:

- User management.
- Provider verification.
- Pet-listing review.
- Application oversight.
- Report handling.
- Content moderation.
- Species and breed management.
- Geographic data management.
- Business category management.
- Notification campaigns.
- Article management.
- Feature flags.
- System configuration.
- Audit logs.
- Analytics and exports.

---

## 8. Important User Journeys

## 8.1 Adopting a Pet

1. User registers and verifies an account.
2. User completes an adopter profile.
3. User searches and filters pets.
4. User views a pet profile.
5. User saves the pet or sends an inquiry.
6. User submits an adoption application.
7. Owner reviews the application.
8. Owner asks questions or shortlists the user.
9. Both parties schedule a meeting.
10. Owner approves the application.
11. Pet becomes reserved.
12. Adoption is completed and confirmed.
13. Pet becomes adopted.
14. Other applications close automatically.
15. Follow-up reminders and reviews become available.

---

## 8.2 Rehoming a Pet

1. Owner registers and verifies identity.
2. Owner creates a pet listing.
3. Owner submits it for moderation.
4. Administrator or automated checks approve the listing.
5. Listing becomes searchable.
6. Owner receives inquiries and applications.
7. Owner reviews applicants.
8. Owner schedules meetings.
9. Owner approves one applicant.
10. Adoption is completed.
11. Listing is archived with an adoption record.

---

## 8.3 Finding and Booking a Vet

1. User searches clinics by location and service.
2. User opens a verified clinic profile.
3. User selects a service and preferred time.
4. User submits an appointment request.
5. Clinic confirms or proposes another time.
6. User receives reminders.
7. Appointment is completed.
8. User may submit a review.

---

## 8.4 Finding a Pet Shop

1. User searches nearby shops or services.
2. User filters by category, location, rating, and opening status.
3. User views shop details, products, services, and contact options.
4. User sends an inquiry, requests a service, or visits the shop.
5. Full ordering may be introduced in a later phase.

---

## 9. Proposed Backend Architecture

The project should begin as a **modular monolith**.

A modular monolith is easier to develop and deploy than microservices while still keeping business domains separated. Individual modules can later be extracted into services when traffic or team size requires it.

```text
Mobile App / Web App / Admin Dashboard
                  |
             API Gateway
          Fastify Application
                  |
 -------------------------------------------------
 | Auth | Users | Pets | Adoption | Messaging    |
 | Vets | Shops | Reviews | Reports | Admin      |
 | Notifications | Media | Search | Content      |
 -------------------------------------------------
        |            |             |
   PostgreSQL      Redis       Object Storage
        |            |             |
     PostGIS      Queues       Images/Documents
```

### Main architectural components

- Fastify REST API.
- WebSocket server for real-time messaging.
- PostgreSQL as the main relational database.
- PostGIS for geographic search.
- Redis for caching, queues, rate limits, and presence.
- S3-compatible object storage for photos, videos, and documents.
- Background workers for notifications and media processing.
- Search layer using PostgreSQL first and OpenSearch later if required.
- Admin dashboard consuming protected administration APIs.

---

## 10. Suggested Technology Stack

### Core backend

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Fastify
- **API style:** REST
- **Validation:** TypeBox or Zod
- **API documentation:** OpenAPI and Swagger
- **ORM/query builder:** Drizzle ORM
- **Database:** PostgreSQL
- **Geospatial support:** PostGIS
- **Cache and queues:** Redis
- **Job processing:** BullMQ
- **Real-time communication:** WebSocket or Socket.IO
- **Object storage:** Amazon S3, Cloudflare R2, or another S3-compatible service
- **Image processing:** Sharp
- **Authentication:** JWT access tokens and rotating refresh tokens
- **Push notifications:** Firebase Cloud Messaging and APNs
- **Email:** Amazon SES, Resend, SendGrid, or another transactional provider
- **SMS/OTP:** A provider supporting Nepalese numbers
- **Logging:** Pino
- **Testing:** Vitest and Fastify inject
- **Containerization:** Docker
- **CI/CD:** GitHub Actions
- **Monitoring:** OpenTelemetry with Sentry, Grafana, or a managed observability service

These choices are recommendations and can be changed without altering the product scope.

---

## 11. Suggested Fastify Project Structure

```text
src/
├── app.ts
├── server.ts
├── config/
│   ├── env.ts
│   ├── database.ts
│   ├── redis.ts
│   └── storage.ts
├── plugins/
│   ├── auth.ts
│   ├── database.ts
│   ├── redis.ts
│   ├── swagger.ts
│   ├── websocket.ts
│   └── error-handler.ts
├── common/
│   ├── errors/
│   ├── guards/
│   ├── hooks/
│   ├── schemas/
│   ├── types/
│   └── utils/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── organizations/
│   ├── pets/
│   ├── breeds/
│   ├── media/
│   ├── favorites/
│   ├── saved-searches/
│   ├── adoption-applications/
│   ├── meetings/
│   ├── conversations/
│   ├── messages/
│   ├── veterinary/
│   ├── appointments/
│   ├── shops/
│   ├── products/
│   ├── services/
│   ├── reviews/
│   ├── reports/
│   ├── verification/
│   ├── notifications/
│   ├── content/
│   ├── analytics/
│   └── admin/
├── jobs/
│   ├── notifications/
│   ├── listing-expiry/
│   ├── media-processing/
│   └── search-indexing/
├── db/
│   ├── schema/
│   ├── migrations/
│   └── seeds/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

Each module should generally contain:

```text
module/
├── module.routes.ts
├── module.controller.ts
├── module.service.ts
├── module.repository.ts
├── module.schema.ts
├── module.types.ts
└── module.test.ts
```

---

## 12. High-Level Database Entities

## Identity and access

- `users`
- `user_profiles`
- `roles`
- `user_roles`
- `sessions`
- `refresh_tokens`
- `verification_tokens`
- `user_devices`
- `notification_preferences`
- `blocked_users`

## Organizations and businesses

- `organizations`
- `organization_members`
- `organization_roles`
- `provider_verifications`
- `verification_documents`
- `business_branches`
- `business_hours`

## Pets and listings

- `species`
- `breeds`
- `pets`
- `pet_listings`
- `pet_media`
- `pet_health_records`
- `pet_vaccinations`
- `pet_traits`
- `pet_compatibilities`
- `listing_status_history`
- `favorites`
- `recently_viewed_pets`
- `saved_searches`

## Adoption

- `adoption_forms`
- `adoption_questions`
- `adoption_applications`
- `adoption_answers`
- `application_documents`
- `application_status_history`
- `adoption_meetings`
- `adoption_records`
- `adoption_follow_ups`

## Communication

- `conversations`
- `conversation_members`
- `messages`
- `message_attachments`
- `message_reads`
- `message_reports`

## Veterinary

- `veterinary_profiles`
- `clinics`
- `clinic_branches`
- `veterinarians`
- `clinic_services`
- `vet_availability`
- `appointments`
- `appointment_status_history`

## Shops and services

- `shops`
- `shop_branches`
- `product_categories`
- `products`
- `service_categories`
- `business_services`
- `promotions`
- `business_inquiries`

## Trust and platform operations

- `reviews`
- `review_responses`
- `reports`
- `report_evidence`
- `moderation_actions`
- `audit_logs`
- `notifications`
- `notification_deliveries`
- `articles`
- `article_categories`
- `feature_flags`

---

## 13. Example API Groups

All APIs should use a version prefix such as `/api/v1`.

### Authentication

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/request-phone-otp
POST   /api/v1/auth/verify-phone-otp
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
```

### User profile

```text
GET    /api/v1/me
PATCH  /api/v1/me
DELETE /api/v1/me
GET    /api/v1/me/sessions
DELETE /api/v1/me/sessions/:sessionId
GET    /api/v1/users/:userId/public-profile
POST   /api/v1/users/:userId/block
DELETE /api/v1/users/:userId/block
```

### Pets

```text
GET    /api/v1/pets
GET    /api/v1/pets/:petId
POST   /api/v1/pets
PATCH  /api/v1/pets/:petId
DELETE /api/v1/pets/:petId
POST   /api/v1/pets/:petId/publish
POST   /api/v1/pets/:petId/pause
POST   /api/v1/pets/:petId/media
POST   /api/v1/pets/:petId/favorite
DELETE /api/v1/pets/:petId/favorite
```

### Adoption applications

```text
POST   /api/v1/pets/:petId/applications
GET    /api/v1/me/applications
GET    /api/v1/applications/:applicationId
PATCH  /api/v1/applications/:applicationId
POST   /api/v1/applications/:applicationId/submit
POST   /api/v1/applications/:applicationId/withdraw
POST   /api/v1/applications/:applicationId/status
POST   /api/v1/applications/:applicationId/meetings
POST   /api/v1/applications/:applicationId/complete
```

### Messaging

```text
GET    /api/v1/conversations
POST   /api/v1/conversations
GET    /api/v1/conversations/:conversationId/messages
POST   /api/v1/conversations/:conversationId/messages
POST   /api/v1/messages/:messageId/read
POST   /api/v1/messages/:messageId/report
```

### Veterinary services

```text
GET    /api/v1/clinics
GET    /api/v1/clinics/:clinicId
POST   /api/v1/clinics
PATCH  /api/v1/clinics/:clinicId
GET    /api/v1/clinics/:clinicId/services
POST   /api/v1/appointments
GET    /api/v1/me/appointments
POST   /api/v1/appointments/:appointmentId/confirm
POST   /api/v1/appointments/:appointmentId/reschedule
POST   /api/v1/appointments/:appointmentId/cancel
```

### Shops

```text
GET    /api/v1/shops
GET    /api/v1/shops/:shopId
POST   /api/v1/shops
PATCH  /api/v1/shops/:shopId
GET    /api/v1/shops/:shopId/products
GET    /api/v1/shops/:shopId/services
POST   /api/v1/shops/:shopId/inquiries
```

### Reviews and reports

```text
POST   /api/v1/reviews
PATCH  /api/v1/reviews/:reviewId
POST   /api/v1/reviews/:reviewId/report
POST   /api/v1/reports
GET    /api/v1/me/reports
```

### Administration

```text
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/users
POST   /api/v1/admin/users/:userId/suspend
POST   /api/v1/admin/verifications/:verificationId/approve
POST   /api/v1/admin/verifications/:verificationId/reject
GET    /api/v1/admin/listings/pending
POST   /api/v1/admin/listings/:listingId/approve
POST   /api/v1/admin/listings/:listingId/reject
GET    /api/v1/admin/reports
POST   /api/v1/admin/reports/:reportId/resolve
GET    /api/v1/admin/audit-logs
```

This is an initial route map, not the final API contract.

---

## 14. Authorization Model

Use role-based access control combined with resource ownership checks.

### Example permissions

| Action | Adopter | Owner | Vet/Clinic | Shop | Admin |
|---|---:|---:|---:|---:|---:|
| Browse public pets | Yes | Yes | Yes | Yes | Yes |
| Submit application | Yes | Optional | Optional | Optional | Yes |
| Create pet listing | No | Yes | Rescue only | No | Yes |
| Review pet applications | No | Own listings | No | No | Yes |
| Manage clinic | No | No | Own clinic | No | Yes |
| Manage shop | No | No | No | Own shop | Yes |
| Moderate content | No | No | No | No | Yes |
| Review verification documents | No | No | No | No | Yes |

A user may have more than one role, such as an adopter who is also a pet owner.

---

## 15. Media and File Handling

The backend should support:

- Direct-to-storage uploads using signed URLs.
- Image type and size validation.
- Virus scanning for documents.
- Automatic image resizing and compression.
- Thumbnail generation.
- Media ordering.
- Private storage for identity and medical documents.
- Public or CDN-backed storage for approved listing images.
- Removal of EXIF location metadata where appropriate.
- Orphan-file cleanup jobs.

Never trust a filename or MIME type sent by the client without server-side validation.

---

## 16. Security Requirements

- Use HTTPS in every environment except local development.
- Hash passwords using Argon2id or bcrypt with an appropriate cost.
- Rotate refresh tokens.
- Store only hashed refresh tokens and OTP values.
- Apply rate limits to login, OTP, messaging, search, and report endpoints.
- Validate every request body, parameter, and query.
- Use strict authorization on every protected resource.
- Prevent users from accessing another user’s private application or documents.
- Use private buckets for verification and health documents.
- Add anti-spam controls to messaging and listing creation.
- Sanitize user-generated text.
- Maintain immutable or append-only audit records for sensitive actions.
- Protect against SQL injection, broken access control, mass assignment, and insecure direct-object references.
- Add account lockout or progressive delays for repeated failed logins.
- Record security-sensitive events.
- Support content removal and account deletion workflows.
- Back up the database and test restoration procedures.

---

## 17. Privacy Requirements

The system will process personal data, location information, private messages, application details, and potentially veterinary information.

The backend should:

- Collect only necessary information.
- Clearly distinguish public and private profile fields.
- Avoid exposing exact residential addresses publicly.
- Require consent before sharing contact information.
- Allow users to download or delete their data where required.
- Define retention periods for rejected applications and verification documents.
- Remove unnecessary EXIF metadata from uploaded media.
- Restrict internal staff access to sensitive records.
- Log administrative access to verification documents.
- Support privacy-policy and terms-version tracking.

---

## 18. Data Integrity and Business Rules

Important rules include:

- A pet can have only one active public listing unless an administrator approves otherwise.
- A pet marked adopted cannot accept new applications.
- A user cannot review a provider without a completed interaction.
- A provider cannot review its own profile.
- A user cannot submit duplicate active applications for the same pet.
- Only the listing owner, authorized organization staff, or administrator can update a listing.
- Only authorized participants can read a private conversation.
- Exact private meeting locations require explicit access.
- Verification approval must record the reviewing administrator and timestamp.
- Adoption and application status changes must create history records.
- Deleted records required for investigations should be soft-deleted or retained according to policy.
- Public ratings should be recalculated from eligible, visible reviews only.

---

## 19. Non-Functional Requirements

### Performance

- Typical read APIs should target a low response time under normal load.
- Search results should use indexed filters.
- Media uploads should bypass the main API server through signed URLs.
- Expensive work should run in background queues.
- Frequently requested public data may be cached.

### Scalability

- The API should be stateless.
- Multiple Fastify instances should be able to run behind a load balancer.
- Redis should coordinate rate limits, queues, and WebSocket presence.
- Database indexes should support common filters and geographic queries.
- Modules should be separable into services later.

### Reliability

- Health and readiness endpoints.
- Graceful shutdown.
- Retry policies for external providers.
- Idempotency for sensitive actions.
- Database transactions for adoption approval and completion.
- Dead-letter handling for failed background jobs.
- Automated backups.

### Observability

- Structured logs with request IDs.
- Error tracking.
- Metrics for API latency and error rates.
- Queue monitoring.
- Security-event monitoring.
- Audit logs for administrative actions.

### Accessibility and localization support

Although mainly a frontend concern, APIs should support:

- English and Nepali content fields where necessary.
- Unicode text.
- Localized notification templates.
- Time-zone-aware dates.
- Configurable country and location data.

---

## 20. Analytics

The platform may track:

- New users by role.
- Verified users and providers.
- Active pet listings.
- Listing approval time.
- Search-to-detail conversion.
- Favorite and inquiry activity.
- Applications per pet.
- Application approval rate.
- Average time to adoption.
- Completed adoptions.
- Appointment requests and completion.
- Most searched species and breeds.
- Popular locations.
- Reports and moderation outcomes.
- Notification delivery performance.
- User retention.

Analytics should avoid exposing private application or message content.

---

## 21. Recommended Development Phases

## Phase 1 — Platform Foundation

- Fastify project setup.
- PostgreSQL and migrations.
- Authentication.
- Common user profiles.
- Roles and permissions.
- Media uploads.
- Location data.
- Admin authentication.
- Logging and error handling.

## Phase 2 — Pet Adoption MVP

- Pet listings.
- Listing moderation.
- Pet search and filters.
- Favorites.
- Owner and adopter profiles.
- Adoption applications.
- Application status management.
- Basic notifications.
- Basic admin dashboard APIs.

## Phase 3 — Communication and Adoption Completion

- Real-time messaging.
- Meeting scheduling.
- Adoption completion.
- Follow-up records.
- Reviews.
- Reporting and blocking.
- Advanced moderation.

## Phase 4 — Veterinary Module

- Vet and clinic registration.
- Professional verification.
- Clinic search.
- Services and opening hours.
- Appointment requests.
- Reviews and reminders.

## Phase 5 — Pet Shop Module

- Shop registration and verification.
- Shop and branch discovery.
- Product and service catalogs.
- Promotions.
- Customer inquiries.
- Shop reviews.

## Phase 6 — Advanced Platform Features

- Saved-search alerts.
- Personalized recommendations.
- Foster workflows.
- Lost-and-found pets.
- Shelter/rescue team management.
- Educational content.
- Advanced analytics.
- Donation and sponsorship features.

## Phase 7 — Optional Marketplace

- Cart and checkout.
- Orders.
- Payment integration.
- Inventory.
- Delivery.
- Refunds.
- Seller settlement.

---

## 22. MVP Recommendation

Even though the long-term scope is a full platform, the first production version should focus on the highest-value workflow:

1. User authentication.
2. Owner verification.
3. Pet listing creation.
4. Listing review.
5. Pet search.
6. Favorites.
7. Pet inquiries.
8. Adoption applications.
9. Application status tracking.
10. Messaging.
11. Adoption completion.
12. Reports and moderation.

Vet and shop discovery may be included in the first release as searchable business directories. Complex appointment scheduling and marketplace ordering can follow later.

---

## 23. Out of Scope for the Initial Backend

Unless separately approved, the first release should not include:

- Full veterinary medical-record management.
- Automated medical diagnosis.
- Insurance claims.
- Prescription issuing.
- Complex hospital-management features.
- Live video consultations.
- Full e-commerce checkout.
- Multi-vendor settlement.
- Delivery-driver management.
- International adoption logistics.
- Cryptocurrency payments.
- AI-only approval or rejection of adoption applications.

---

## 24. Success Criteria

The backend will be considered successful when:

- Owners can publish trusted pet listings.
- Adopters can quickly find relevant pets.
- Adoption applications are structured and trackable.
- Owners can safely review and select applicants.
- Users can communicate without exposing private contact details immediately.
- Completed adoptions are properly recorded.
- Fraudulent or harmful activity can be reported and moderated.
- Vets and shops can maintain discoverable, verified profiles.
- The API is secure, documented, tested, and scalable.

---

## 25. Project Assumptions

- The first target country is Nepal.
- Fastify and TypeScript will be used for the backend.
- PostgreSQL will be the main database.
- Mobile applications will consume the APIs.
- A separate web-based admin dashboard will be created.
- Individual owners may list pets, subject to verification and moderation.
- Shelters and rescue groups may use organization accounts.
- Veterinary and shop modules initially focus on discovery and inquiries.
- Adoption is a matching and application workflow, not a normal product purchase.
- Payment functionality is optional and should not block the adoption MVP.
- Platform administrators have the final authority over verification and moderation.

---

## 26. Reference Inspiration

- Nyanoghar UI/UX case study:  
  https://www.behance.net/gallery/252097689/NYANOGHARCASESTUDYSENTINEL

- Petfinder:  
  https://www.petfinder.com/

The final product should use its own branding, business rules, database design, API contracts, and user experience. The references are used to understand the product category and expected workflows, not to copy proprietary implementation details.

---

## 27. One-Sentence Product Description

**Nyanoghar is a trusted pet adoption and pet-care platform that connects adopters, pet owners, rescue organizations, veterinarians, and pet shops through verified profiles, structured workflows, location-based discovery, and secure communication.**
