-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Sep 23, 2025 at 10:37 AM
-- Server version: 11.8.3-MariaDB-log
-- PHP Version: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `u674714135_vtrack`
--

DELIMITER $$
--
-- Procedures
--
CREATE DEFINER=`u674714135_vtrack_user`@`127.0.0.1` PROCEDURE `CalculateCitationTotal` (IN `p_violator_id` BIGINT, IN `p_violation_types` JSON, OUT `p_total_amount` DECIMAL(10,2), OUT `p_violation_details` JSON)   BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_violation_id BIGINT;
    DECLARE v_offense_level ENUM('First Offense', 'Second Offense', 'Third Offense');
    DECLARE v_penalty DECIMAL(10,2);
    DECLARE v_name VARCHAR(255);
    DECLARE v_total DECIMAL(10,2) DEFAULT 0.00;
    DECLARE v_details JSON DEFAULT JSON_ARRAY();
    DECLARE v_detail JSON;

    DECLARE violation_cursor CURSOR FOR
        SELECT JSON_UNQUOTE(JSON_EXTRACT(p_violation_types, CONCAT('$[', idx, ']'))) AS violation_id
        FROM (
            SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
        ) numbers
        WHERE JSON_EXTRACT(p_violation_types, CONCAT('$[', idx, ']')) IS NOT NULL;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN violation_cursor;

    read_loop: LOOP
        FETCH violation_cursor INTO v_violation_id;
        IF done THEN
            LEAVE read_loop;
        END IF;

        SELECT name, 
               COALESCE(penalty_first, 0.00), 
               COALESCE(penalty_second, 0.00), 
               COALESCE(penalty_third, 0.00)
        INTO v_name, @p1, @p2, @p3
        FROM violations
        WHERE id = v_violation_id;

        -- For simplicity, assuming always First Offense (customize this logic as needed)
        SET v_offense_level = 'First Offense';
        SET v_penalty = @p1;

        SET v_detail = JSON_OBJECT(
            'violation_id', v_violation_id,
            'name', v_name,
            'offense_level', v_offense_level,
            'penalty', v_penalty
        );

        SET v_details = JSON_ARRAY_APPEND(v_details, '$', v_detail);
        SET v_total = v_total + v_penalty;
    END LOOP;

    CLOSE violation_cursor;

    SET p_total_amount = v_total;
    SET p_violation_details = v_details;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `locations`
--

CREATE TABLE `locations` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `street_address` text DEFAULT NULL,
  `zip_code` varchar(10) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `locations`
--

INSERT INTO `locations` (`id`, `name`, `street_address`, `zip_code`, `created_at`) VALUES
(1, 'Cabagan Police Station', 'Municipal Hall Complex', '3328', '2025-07-19 06:56:46'),
(2, 'Barangay San Antonio Outpost', 'Barangay San Antonio', '3328', '2025-07-19 06:56:46'),
(3, 'Barangay Centro East Outpost', 'Barangay Centro East', '3328', '2025-07-19 06:56:46'),
(4, 'Test', 'Test', '3500', '2025-07-27 07:02:09'),
(5, 'Test 2', 'Test', '3500', '2025-07-27 07:05:22');

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` bigint(20) NOT NULL,
  `violation_record_id` bigint(20) NOT NULL,
  `receipt_no` varchar(100) NOT NULL,
  `paid_at` datetime NOT NULL,
  `amount_paid` decimal(10,2) NOT NULL,
  `payment_method` enum('Cash','Bank Transfer','Check','Online') DEFAULT 'Cash',
  `processed_by` int(11) DEFAULT NULL COMMENT 'Reference to users table who processed payment',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payments`
--

INSERT INTO `payments` (`id`, `violation_record_id`, `receipt_no`, `paid_at`, `amount_paid`, `payment_method`, `processed_by`, `notes`, `created_at`) VALUES
(1, 4, '1234567', '2025-07-27 01:34:39', 1000.00, 'Cash', 1, '0', '2025-07-26 17:34:39'),
(2, 7, 'OR-01582', '2025-07-28 14:17:40', 8500.00, 'Cash', 1, '0', '2025-07-28 14:17:40'),
(3, 6, '56fch9', '2025-09-10 13:30:00', 17000.00, 'Cash', 1, '0', '2025-09-10 13:30:00');

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `roles`
--

INSERT INTO `roles` (`id`, `name`, `description`, `created_at`) VALUES
(1, 'admin', 'System administrator with full access', '2025-07-19 06:56:46'),
(2, 'officer', 'Police officer with field access', '2025-07-19 06:56:46'),
(3, 'treasurer', 'Financial officer with budget access', '2025-07-19 06:56:46'),
(4, 'lgu', NULL, '2025-07-29 11:47:45');

-- --------------------------------------------------------

--
-- Table structure for table `teams`
--

CREATE TABLE `teams` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `location_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `teams`
--

INSERT INTO `teams` (`id`, `name`, `description`, `location_id`, `created_at`) VALUES
(1, 'Alpha Team', 'Main station patrol unit', 1, '2025-07-19 06:56:46'),
(2, 'Bravo Team', 'San Antonio patrol unit', 2, '2025-07-19 06:56:46'),
(3, 'Charlie Team', 'Centro East patrol unit', 3, '2025-07-19 06:56:46'),
(4, 'Traffic Division', 'Traffic enforcement team', 1, '2025-07-19 06:56:46'),
(6, 'Test', 'test', 1, '2025-07-28 14:02:25');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `first_name` varchar(50) NOT NULL,
  `last_name` varchar(50) NOT NULL,
  `role_id` int(11) NOT NULL,
  `team_id` int(11) DEFAULT NULL,
  `badge_number` varchar(20) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL COMMENT 'Path to user avatar image (stored in /avatars folder)',
  `avatar_updated_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `email`, `password_hash`, `first_name`, `last_name`, `role_id`, `team_id`, `badge_number`, `phone`, `avatar`, `avatar_updated_at`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'admin@vtrack.com', '$2y$10$fE672.7vm5FX0wT5x5ij.uWREyX9ZArb5bSx3U1SWactWHRv0eKG2', 'Admin', 'User', 1, NULL, NULL, '', 'avatars/avatar_1_1753712372.jpg', '2025-07-28 14:19:32', 1, '2025-07-19 06:56:46', '2025-09-20 05:41:21'),
(2, 'treasurer@vtrack.com', '$2y$10$QwOgEzsAIoo685jM0WUcYO64NAnFqXrcx1OQoFPTESbJ9USmRvQyS', 'Treasury', 'Officer', 3, NULL, NULL, NULL, NULL, NULL, 1, '2025-07-19 06:56:46', '2025-07-19 06:56:46'),
(3, 'officer1@vtrack.com', '$2y$10$QwOgEzsAIoo685jM0WUcYO64NAnFqXrcx1OQoFPTESbJ9USmRvQyS', 'John', 'Smith', 2, 1, 'B001', '555-0101', NULL, NULL, 1, '2025-07-19 06:56:46', '2025-09-11 05:47:53'),
(4, 'officer2@vtrack.com', '$2y$10$QwOgEzsAIoo685jM0WUcYO64NAnFqXrcx1OQoFPTESbJ9USmRvQyS', 'Jane', 'Doe', 2, 1, 'B002', '555-0102', NULL, NULL, 1, '2025-07-19 06:56:46', '2025-07-19 06:56:46'),
(5, 'officer3@vtrack.com', '$2y$10$QwOgEzsAIoo685jM0WUcYO64NAnFqXrcx1OQoFPTESbJ9USmRvQyS', 'Mike', 'Johnson', 2, 2, 'B003', '555-0103', NULL, NULL, 1, '2025-07-19 06:56:46', '2025-07-19 06:56:46'),
(8, 'office4r@vtrack.com', '$2y$10$Ss/SPUmjRxfESW4hyDJF5eFwROMagbE.cugFj7iPlSDhTVmuN/OVi', 'Test', 'Test', 2, 6, 'B010', '1234567', NULL, NULL, 1, '2025-07-28 14:03:09', '2025-07-28 14:03:09'),
(9, 'lguadmin@vtrack.com', '$2y$10$LbHkLyjXCM8EGNOSUfdEquW8cDV21cDbIp73esu0zqNcG4Fa89YkK', 'LGU', 'Admin', 3, NULL, NULL, NULL, NULL, NULL, 1, '2025-07-29 11:59:12', '2025-09-20 08:03:48'),
(10, 'lgu@vtrack.com', '$2y$10$5cS6mHVYpf8AuiqhBfLwj.JYMQ4J1RqofUtTpfG0QEJGS1qrGGFTy', 'LGU', 'User', 4, NULL, NULL, NULL, NULL, NULL, 1, '2025-07-29 11:59:12', '2025-08-08 11:02:29'),
(11, 'jun@gmail.com', '$2y$10$BOxr1O4k64vUxc3BkYy8Du3A9Zm7.jj6nSQIa0oJtoujQX6pUi1tO', 'asd', 'sfs', 2, 1, '123', '0225952458', NULL, NULL, 1, '2025-09-11 05:48:51', '2025-09-11 05:48:51'),
(12, 'tan@gmail.com', '$2y$10$9ixU7QGpgV2rD939IfL9ke0/XPHNHHrBiv9Ny62ynTfzIyNUNh2we', 'tanggol', 'dalisay', 2, NULL, '4545', '5454', NULL, NULL, 1, '2025-09-11 05:50:31', '2025-09-11 05:50:31');

-- --------------------------------------------------------

--
-- Table structure for table `violation_junction`
--

CREATE TABLE `violation_junction` (
  `id` bigint(20) NOT NULL,
  `violation_record_id` bigint(20) NOT NULL,
  `violation_list_id` bigint(20) NOT NULL,
  `offense_level` enum('First Offense','Second Offense','Third Offense') NOT NULL DEFAULT 'First Offense',
  `penalty_applied` decimal(10,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `violation_junction`
--

INSERT INTO `violation_junction` (`id`, `violation_record_id`, `violation_list_id`, `offense_level`, `penalty_applied`, `created_at`) VALUES
(1, 1, 4, 'First Offense', 300.00, '2025-07-26 13:39:22'),
(2, 2, 4, 'Second Offense', 500.00, '2025-07-26 15:04:52'),
(3, 3, 9, 'First Offense', 750.00, '2025-07-26 15:31:26'),
(4, 3, 7, 'First Offense', 300.00, '2025-07-26 15:31:26'),
(5, 4, 4, 'Third Offense', 1000.00, '2025-07-26 15:43:01'),
(6, 5, 6, 'First Offense', 5000.00, '2025-07-27 09:08:38'),
(7, 5, 1, 'First Offense', 1000.00, '2025-07-27 09:08:38'),
(8, 6, 1, 'Second Offense', 2000.00, '2025-07-27 09:33:05'),
(9, 6, 6, 'Second Offense', 15000.00, '2025-07-27 09:33:05'),
(10, 7, 2, 'First Offense', 2500.00, '2025-07-28 14:07:37'),
(11, 7, 6, 'First Offense', 5000.00, '2025-07-28 14:07:37'),
(12, 7, 1, 'First Offense', 1000.00, '2025-07-28 14:07:37');

-- --------------------------------------------------------

--
-- Table structure for table `violation_levels`
--

CREATE TABLE `violation_levels` (
  `id` bigint(20) NOT NULL,
  `violation_list_id` bigint(20) NOT NULL,
  `offense_level` enum('First Offense','Second Offense','Third Offense') NOT NULL,
  `penalty` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `violation_levels`
--

INSERT INTO `violation_levels` (`id`, `violation_list_id`, `offense_level`, `penalty`, `created_at`, `updated_at`) VALUES
(1, 1, 'First Offense', 1000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(2, 2, 'First Offense', 2500.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(3, 3, 'First Offense', 2000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(4, 4, 'First Offense', 500.00, '2025-07-26 13:17:29', '2025-07-28 14:29:33'),
(5, 5, 'First Offense', 1500.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(6, 6, 'First Offense', 1000.00, '2025-07-26 13:17:29', '2025-07-28 14:28:19'),
(7, 7, 'First Offense', 300.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(8, 8, 'First Offense', 1000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(9, 9, 'First Offense', 750.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(10, 10, 'First Offense', 1800.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(16, 1, 'Second Offense', 2000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(17, 2, 'Second Offense', 5000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(18, 3, 'Second Offense', 4000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(19, 4, 'Second Offense', 700.00, '2025-07-26 13:17:29', '2025-07-28 14:29:33'),
(20, 5, 'Second Offense', 3000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(21, 6, 'Second Offense', 600.00, '2025-07-26 13:17:29', '2025-09-03 14:14:29'),
(22, 7, 'Second Offense', 450.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(23, 8, 'Second Offense', 1500.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(24, 9, 'Second Offense', 1125.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(25, 10, 'Second Offense', 2700.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(31, 1, 'Third Offense', 4000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(32, 2, 'Third Offense', 10000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(33, 3, 'Third Offense', 8000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(34, 4, 'Third Offense', 1000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(35, 5, 'Third Offense', 6000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(36, 6, 'Third Offense', 25000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(37, 7, 'Third Offense', 600.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(38, 8, 'Third Offense', 2000.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(39, 9, 'Third Offense', 1500.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(40, 10, 'Third Offense', 3600.00, '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(52, 12, 'First Offense', 100.00, '2025-07-28 14:04:16', '2025-07-28 14:04:16'),
(53, 12, 'Second Offense', 200.00, '2025-07-28 14:04:16', '2025-07-28 14:04:16'),
(54, 12, 'Third Offense', 300.00, '2025-07-28 14:04:16', '2025-07-28 14:04:16'),
(64, 13, 'First Offense', 123.00, '2025-09-10 13:29:00', '2025-09-10 13:29:00'),
(65, 13, 'Second Offense', 246.00, '2025-09-10 13:29:00', '2025-09-10 13:29:00'),
(66, 13, 'Third Offense', 567.00, '2025-09-10 13:29:00', '2025-09-10 13:29:00'),
(67, 14, 'First Offense', 150.00, '2025-09-11 05:26:24', '2025-09-11 05:26:24'),
(68, 14, 'Second Offense', 300.00, '2025-09-11 05:26:24', '2025-09-11 05:26:24'),
(69, 14, 'Third Offense', 500.00, '2025-09-11 05:26:25', '2025-09-11 05:26:25');

-- --------------------------------------------------------

--
-- Table structure for table `violation_list`
--

CREATE TABLE `violation_list` (
  `id` bigint(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `level` enum('Minor','Major','Severe') NOT NULL,
  `penalty` decimal(10,2) NOT NULL COMMENT 'Base penalty (First Offense)',
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `violation_list`
--

INSERT INTO `violation_list` (`id`, `name`, `level`, `penalty`, `description`, `created_at`, `updated_at`) VALUES
(1, 'Speeding', 'Major', 1000.00, 'Exceeding speed limit', '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(2, 'No License', 'Severe', 2500.00, 'Driving without valid license', '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(4, 'Illegal Parking', 'Minor', 500.00, 'Parking in prohibited area', '2025-07-26 13:17:29', '2025-07-28 14:29:33'),
(6, 'Drunk Driving', 'Severe', 1000.00, 'Driving under influenceee', '2025-07-26 13:17:29', '2025-07-28 14:28:19'),
(7, 'No Helmet', 'Minor', 300.00, 'Motorcycle rider without helmet', '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(8, 'Expired Registration', 'Major', 1000.00, 'Vehicle with expired registration', '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(9, 'Illegal U-Turn', 'Minor', 750.00, 'Making U-turn in prohibited area', '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(10, 'Overloading', 'Major', 1800.00, 'Vehicle exceeding weight/passenger limit', '2025-07-26 13:17:29', '2025-07-26 13:17:29'),
(12, 'Test', 'Severe', 100.00, 'aasdassdada', '2025-07-28 14:04:16', '2025-07-28 14:04:16'),
(14, 'horn', 'Minor', 150.00, '', '2025-09-11 05:26:22', '2025-09-11 05:26:53');

-- --------------------------------------------------------

--
-- Table structure for table `violation_record`
--

CREATE TABLE `violation_record` (
  `id` bigint(20) NOT NULL,
  `violator_id` bigint(20) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('Pending','Paid','Overdue','Cancelled') NOT NULL DEFAULT 'Pending',
  `location` text NOT NULL,
  `date` datetime NOT NULL,
  `apprehending_officer` int(11) NOT NULL COMMENT 'Reference to users table',
  `evidences` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'JSON array of evidence files/photos with metadata' CHECK (json_valid(`evidences`)),
  `officers_note` text DEFAULT NULL,
  `confiscated` text DEFAULT NULL COMMENT 'Text description of confiscated items (e.g., "ORCR is confiscated")',
  `confiscated_returned` tinyint(1) DEFAULT 0 COMMENT 'Indicates if confiscated items have been returned to violator',
  `plate_no` varchar(20) DEFAULT NULL,
  `or_number` varchar(50) DEFAULT NULL COMMENT 'Official Receipt number',
  `cr_number` varchar(50) DEFAULT NULL COMMENT 'Case Record number',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_reminder_sent` datetime DEFAULT NULL COMMENT 'Timestamp of the last SMS reminder sent for this citation',
  `is_accident` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Indicates if the violation is related to an accident (0 = No, 1 = Yes)',
  `permit` text DEFAULT NULL,
  `vehicle_plate_no` text DEFAULT NULL,
  `year` text DEFAULT NULL,
  `vehicle_make` text DEFAULT NULL,
  `body` text DEFAULT NULL,
  `color` text DEFAULT NULL,
  `registered_owner` text DEFAULT NULL,
  `registered_owner_address` text DEFAULT NULL,
  `vehicle_place_issued` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `violation_record`
--

INSERT INTO `violation_record` (`id`, `violator_id`, `total_amount`, `status`, `location`, `date`, `apprehending_officer`, `evidences`, `officers_note`, `confiscated`, `confiscated_returned`, `plate_no`, `or_number`, `cr_number`, `created_at`, `updated_at`, `last_reminder_sent`, `is_accident`, `permit`, `vehicle_plate_no`, `year`, `vehicle_make`, `body`, `color`, `registered_owner`, `registered_owner_address`, `vehicle_place_issued`) VALUES
(1, 2, 300.00, 'Cancelled', 'Tuguegarao City, Cagayan, Cagayan Valley, PHL', '2025-07-26 21:38:00', 1, '[]', 'illegal', 'Items were confiscated', 0, '0', 'OR123', 'CR123', '2025-07-26 13:39:22', '2025-07-26 17:26:49', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(2, 2, 500.00, 'Paid', 'Tuguegarao City, Cagayan, Cagayan Valley, PHL', '2025-07-26 23:02:00', 1, '[]', 'Test', NULL, 0, '0', 'OR123', 'CR123', '2025-07-26 15:04:52', '2025-07-26 17:30:01', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(3, 2, 1050.00, 'Pending', 'Tuguegarao City, Cagayan, Cagayan Valley, PHL', '2025-07-26 23:21:00', 4, '[{\"original_name\":\"luffy.jpg\",\"file_name\":\"6884f4ce307bd_1753543886.jpg\",\"file_type\":\"image\\/jpeg\",\"file_size\":79624,\"upload_date\":\"2025-07-26 17:31:26\"}]', '', 'ORCR', 0, '0', 'OR123', 'CR123', '2025-07-26 15:31:26', '2025-07-30 13:41:03', '2025-07-30 13:41:03', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(4, 2, 1000.00, 'Paid', 'Tuguegarao City, Cagayan, Cagayan Valley, PHL', '2025-07-26 23:40:00', 4, '[{\"original_name\":\"dummy.pdf\",\"file_path\":\"assets\\/evidences\\/6884f7851b5eb_1753544581.pdf\",\"file_type\":\"application\\/pdf\",\"file_size\":13264,\"upload_date\":\"2025-07-26 17:43:01\"},{\"original_name\":\"luffy.jpg\",\"file_path\":\"assets\\/evidences\\/6884f7851b806_1753544581.jpg\",\"file_type\":\"image\\/jpeg\",\"file_size\":79624,\"upload_date\":\"2025-07-26 17:43:01\"}]', '', 'ORCR', 0, '0', 'OR123', 'CR123', '2025-07-26 15:43:01', '2025-07-26 17:34:39', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(5, 3, 6000.00, 'Pending', 'Tuguegarao City, Cagayan, Cagayan Valley, PHL', '2025-07-27 17:07:00', 4, '[{\"original_name\":\"luffy.jpg\",\"file_path\":\"assets\\/evidences\\/6885ec9607d28_1753607318.jpg\",\"file_type\":\"image\\/jpeg\",\"file_size\":79624,\"upload_date\":\"2025-07-27 11:08:38\"}]', 'Very bad driver', 'Drivers license', 0, '0', 'OR1234', 'CR1235', '2025-07-27 09:08:38', '2025-07-30 13:41:04', '2025-07-30 13:41:04', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(6, 3, 17000.00, 'Paid', 'Tuguegarao City, Cagayan, Cagayan Valley, PHL', '2025-07-27 17:31:00', 4, '[{\"original_name\":\"luffy.jpg\",\"file_path\":\"assets\\/evidences\\/6885f2512e8e6_1753608785.jpg\",\"file_type\":\"image\\/jpeg\",\"file_size\":79624,\"upload_date\":\"2025-07-27 09:33:05\"}]', 'Ang bilis mo nanaman ulit magmaneho', 'ORCR', 1, '0', 'OR1234', 'CR1234', '2025-07-27 09:33:05', '2025-09-20 05:41:45', '2025-07-30 13:41:06', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(7, 4, 8500.00, 'Paid', 'Cabagan', '2025-07-28 22:04:00', 4, '[{\"original_name\":\"luffy.jpg\",\"file_path\":\"assets\\/evidences\\/6887842942a1c_1753711657.jpg\",\"file_type\":\"image\\/jpeg\",\"file_size\":79624,\"upload_date\":\"2025-07-28 14:07:37\"}]', 'riding a motorcycle so fast', 'License', 0, '0', 'OR123345', 'CR21125415415', '2025-07-28 14:07:37', '2025-08-06 10:57:41', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `violators`
--

CREATE TABLE `violators` (
  `id` bigint(20) NOT NULL,
  `contact_no` varchar(20) NOT NULL,
  `drivers_license` varchar(50) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `gender` enum('Male','Female','Other') NOT NULL,
  `address` text NOT NULL,
  `age` int(11) NOT NULL,
  `date_of_birth` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `nationality` text DEFAULT NULL,
  `license_type` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `violators`
--

INSERT INTO `violators` (`id`, `contact_no`, `drivers_license`, `first_name`, `last_name`, `gender`, `address`, `age`, `date_of_birth`, `created_at`, `updated_at`, `nationality`, `license_type`) VALUES
(2, '09177758872', 'ABC123', 'Richmond', 'Lavadia', 'Male', 'Test Street', 8, '2017-06-26', '2025-07-26 13:39:22', '2025-07-26 15:43:01', NULL, NULL),
(3, '09453386067', 'ABC1234', 'Ralph', 'Punzalan', 'Male', 'Test Street', 23, '2001-11-23', '2025-07-27 09:08:38', '2025-07-27 09:33:05', NULL, NULL),
(4, '09059241025', 'ABC123456', 'Lovely', 'Languian', 'Female', 'Test Address', 21, '2003-09-22', '2025-07-28 14:07:37', '2025-07-28 14:07:37', NULL, NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `locations`
--
ALTER TABLE `locations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `violation_record_id` (`violation_record_id`),
  ADD UNIQUE KEY `receipt_no` (`receipt_no`),
  ADD KEY `processed_by` (`processed_by`),
  ADD KEY `idx_receipt_no` (`receipt_no`),
  ADD KEY `idx_paid_at` (`paid_at`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `teams`
--
ALTER TABLE `teams`
  ADD PRIMARY KEY (`id`),
  ADD KEY `location_id` (`location_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `role_id` (`role_id`),
  ADD KEY `team_id` (`team_id`);

--
-- Indexes for table `violation_junction`
--
ALTER TABLE `violation_junction`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_violation_combo` (`violation_record_id`,`violation_list_id`),
  ADD KEY `violation_list_id` (`violation_list_id`);

--
-- Indexes for table `violation_levels`
--
ALTER TABLE `violation_levels`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_violation_level` (`violation_list_id`,`offense_level`),
  ADD KEY `idx_violation_offense` (`violation_list_id`,`offense_level`);

--
-- Indexes for table `violation_list`
--
ALTER TABLE `violation_list`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `violation_record`
--
ALTER TABLE `violation_record`
  ADD PRIMARY KEY (`id`),
  ADD KEY `violator_id` (`violator_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_date` (`date`),
  ADD KEY `idx_plate_no` (`plate_no`),
  ADD KEY `idx_violation_record_officer` (`apprehending_officer`),
  ADD KEY `idx_violation_record_date_status` (`date`,`status`),
  ADD KEY `idx_confiscated` (`confiscated`(100)),
  ADD KEY `idx_violation_record_reminder_status` (`status`,`date`,`last_reminder_sent`),
  ADD KEY `idx_violation_record_is_accident` (`is_accident`);

--
-- Indexes for table `violators`
--
ALTER TABLE `violators`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `drivers_license` (`drivers_license`),
  ADD KEY `idx_drivers_license` (`drivers_license`),
  ADD KEY `idx_contact_no` (`contact_no`),
  ADD KEY `idx_violators_name` (`first_name`,`last_name`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `locations`
--
ALTER TABLE `locations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `roles`
--
ALTER TABLE `roles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `teams`
--
ALTER TABLE `teams`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `violation_junction`
--
ALTER TABLE `violation_junction`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `violation_levels`
--
ALTER TABLE `violation_levels`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=73;

--
-- AUTO_INCREMENT for table `violation_list`
--
ALTER TABLE `violation_list`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `violation_record`
--
ALTER TABLE `violation_record`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `violators`
--
ALTER TABLE `violators`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`violation_record_id`) REFERENCES `violation_record` (`id`),
  ADD CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `teams`
--
ALTER TABLE `teams`
  ADD CONSTRAINT `teams_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
