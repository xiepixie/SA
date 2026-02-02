export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      available_themes: {
        Row: {
          color_scheme: string
          display_order: number | null
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          color_scheme: string
          display_order?: number | null
          id: string
          is_default?: boolean
          name: string
        }
        Update: {
          color_scheme?: string
          display_order?: number | null
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          countdown_mode: string
          created_at: string
          custom_event_name: string | null
          custom_target_date: string | null
          custom_target_time: string | null
          dark_theme: string
          display_name: string | null
          language: string
          light_theme: string
          notify_drift: boolean
          notify_push: boolean
          notify_sync: boolean
          rollover_hour: number
          theme_mode: string
          timezone: string
          updated_at: string
          user_id: string
          ux_animations: boolean
          ux_reduced_motion: boolean
          ux_reflections: boolean
        }
        Insert: {
          countdown_mode?: string
          created_at?: string
          custom_event_name?: string | null
          custom_target_date?: string | null
          custom_target_time?: string | null
          dark_theme?: string
          display_name?: string | null
          language?: string
          light_theme?: string
          notify_drift?: boolean
          notify_push?: boolean
          notify_sync?: boolean
          rollover_hour?: number
          theme_mode?: string
          timezone?: string
          updated_at?: string
          user_id: string
          ux_animations?: boolean
          ux_reduced_motion?: boolean
          ux_reflections?: boolean
        }
        Update: {
          countdown_mode?: string
          created_at?: string
          custom_event_name?: string | null
          custom_target_date?: string | null
          custom_target_time?: string | null
          dark_theme?: string
          display_name?: string | null
          language?: string
          light_theme?: string
          notify_drift?: boolean
          notify_push?: boolean
          notify_sync?: boolean
          rollover_hour?: number
          theme_mode?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          ux_animations?: boolean
          ux_reduced_motion?: boolean
          ux_reflections?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_dark_theme"
            columns: ["dark_theme"]
            isOneToOne: false
            referencedRelation: "available_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_light_theme"
            columns: ["light_theme"]
            isOneToOne: false
            referencedRelation: "available_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          created_at: string
          difficulty: number
          due: string
          elapsed_days: number
          id: string
          lapses: number
          last_review: string | null
          last_user_answer: Json | null
          last_wrong_answer: string | null
          migrated_from_sm2: boolean
          notes: string | null
          personal_tags: Json
          question_id: string
          reps: number
          scheduled_days: number
          sm2_migrated_at: string | null
          stability: number
          state: number
          subscribed_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number
          due?: string
          elapsed_days?: number
          id?: string
          lapses?: number
          last_review?: string | null
          last_user_answer?: Json | null
          last_wrong_answer?: string | null
          migrated_from_sm2?: boolean
          notes?: string | null
          personal_tags?: Json
          question_id: string
          reps?: number
          scheduled_days?: number
          sm2_migrated_at?: string | null
          stability?: number
          state?: number
          subscribed_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number
          due?: string
          elapsed_days?: number
          id?: string
          lapses?: number
          last_review?: string | null
          last_user_answer?: Json | null
          last_wrong_answer?: string | null
          migrated_from_sm2?: boolean
          notes?: string | null
          personal_tags?: Json
          question_id?: string
          reps?: number
          scheduled_days?: number
          sm2_migrated_at?: string | null
          stability?: number
          state?: number
          subscribed_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "error_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      cards_sync_pulse: {
        Row: {
          card_id: string
          due: string | null
          lapses: number | null
          seq: number
          state: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          due?: string | null
          lapses?: number | null
          seq?: number
          state?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          due?: string | null
          lapses?: number | null
          seq?: number
          state?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_sync_pulse_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_sync_pulse_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "v_due_cards"
            referencedColumns: ["card_id"]
          },
        ]
      }
      error_question_tags: {
        Row: {
          created_at: string
          question_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          question_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          question_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_question_tags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "error_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_question_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      error_questions: {
        Row: {
          content: string | null
          content_hash: string | null
          correct_answer: Json
          correct_answer_image_url: string | null
          correct_answer_text: string | null
          created_at: string
          difficulty: Database["public"]["Enums"]["difficulty_enum"]
          explanation: string | null
          explanation_image_url: string | null
          forked_from: string | null
          hints: Json | null
          id: string
          image_url: string | null
          is_archived: boolean
          last_synced_hash: string | null
          metadata: Json | null
          question_type: Database["public"]["Enums"]["question_type_enum"]
          subject_id: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          content?: string | null
          content_hash?: string | null
          correct_answer?: Json
          correct_answer_image_url?: string | null
          correct_answer_text?: string | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_enum"]
          explanation?: string | null
          explanation_image_url?: string | null
          forked_from?: string | null
          hints?: Json | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          last_synced_hash?: string | null
          metadata?: Json | null
          question_type: Database["public"]["Enums"]["question_type_enum"]
          subject_id?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          content?: string | null
          content_hash?: string | null
          correct_answer?: Json
          correct_answer_image_url?: string | null
          correct_answer_text?: string | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_enum"]
          explanation?: string | null
          explanation_image_url?: string | null
          forked_from?: string | null
          hints?: Json | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          last_synced_hash?: string | null
          metadata?: Json | null
          question_type?: Database["public"]["Enums"]["question_type_enum"]
          subject_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_questions_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "error_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_records: {
        Row: {
          answer_mode: Database["public"]["Enums"]["answer_mode_enum"] | null
          answers: Json | null
          config: Json | null
          created_at: string
          duration_seconds: number | null
          end_time: string | null
          id: string
          mode: Database["public"]["Enums"]["exam_mode_enum"]
          question_count: number
          question_ids: string[]
          results: Json | null
          score: number | null
          start_time: string
          status: Database["public"]["Enums"]["exam_status_enum"]
          subject_id: string | null
          template_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_mode?: Database["public"]["Enums"]["answer_mode_enum"] | null
          answers?: Json | null
          config?: Json | null
          created_at?: string
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["exam_mode_enum"]
          question_count: number
          question_ids?: string[]
          results?: Json | null
          score?: number | null
          start_time?: string
          status?: Database["public"]["Enums"]["exam_status_enum"]
          subject_id?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_mode?: Database["public"]["Enums"]["answer_mode_enum"] | null
          answers?: Json | null
          config?: Json | null
          created_at?: string
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["exam_mode_enum"]
          question_count?: number
          question_ids?: string[]
          results?: Json | null
          score?: number | null
          start_time?: string
          status?: Database["public"]["Enums"]["exam_status_enum"]
          subject_id?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_records_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      fsrs_configs: {
        Row: {
          created_at: string
          hash: string
          id: number
          weights: Json
        }
        Insert: {
          created_at?: string
          hash: string
          id?: number
          weights: Json
        }
        Update: {
          created_at?: string
          hash?: string
          id?: number
          weights?: Json
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          attempts: number
          checkpoint_row: number | null
          completed_at: string | null
          config: Json
          created_at: string
          error_count: number | null
          error_details: Json | null
          file_name: string
          file_path: string
          file_size_bytes: number | null
          file_type: Database["public"]["Enums"]["import_file_type_enum"]
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_retry_at: string | null
          processed_rows: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status_enum"]
          success_count: number | null
          total_rows: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          checkpoint_row?: number | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          error_count?: number | null
          error_details?: Json | null
          file_name: string
          file_path: string
          file_size_bytes?: number | null
          file_type: Database["public"]["Enums"]["import_file_type_enum"]
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          processed_rows?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status_enum"]
          success_count?: number | null
          total_rows?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          checkpoint_row?: number | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          error_count?: number | null
          error_details?: Json | null
          file_name?: string
          file_path?: string
          file_size_bytes?: number | null
          file_type?: Database["public"]["Enums"]["import_file_type_enum"]
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          processed_rows?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status_enum"]
          success_count?: number | null
          total_rows?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_jobs_pulse: {
        Row: {
          completed_at: string | null
          error_count: number | null
          job_id: string
          last_error: string | null
          processed_rows: number | null
          seq: number
          started_at: string | null
          status: Database["public"]["Enums"]["job_status_enum"]
          success_count: number | null
          total_rows: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error_count?: number | null
          job_id: string
          last_error?: string | null
          processed_rows?: number | null
          seq?: number
          started_at?: string | null
          status: Database["public"]["Enums"]["job_status_enum"]
          success_count?: number | null
          total_rows?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error_count?: number | null
          job_id?: string
          last_error?: string | null
          processed_rows?: number | null
          seq?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status_enum"]
          success_count?: number | null
          total_rows?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_pulse_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      management_logs: {
        Row: {
          affected_ids: string[]
          created_at: string
          entity_type: Database["public"]["Enums"]["mgmt_entity_type_enum"]
          id: string
          metadata: Json
          op_type: Database["public"]["Enums"]["mgmt_op_type_enum"]
          source_id: string
          target_id: string | null
          undo_metadata: Json
          undone_at: string | null
          undone_by: string | null
          user_id: string
        }
        Insert: {
          affected_ids?: string[]
          created_at?: string
          entity_type: Database["public"]["Enums"]["mgmt_entity_type_enum"]
          id?: string
          metadata?: Json
          op_type: Database["public"]["Enums"]["mgmt_op_type_enum"]
          source_id: string
          target_id?: string | null
          undo_metadata?: Json
          undone_at?: string | null
          undone_by?: string | null
          user_id: string
        }
        Update: {
          affected_ids?: string[]
          created_at?: string
          entity_type?: Database["public"]["Enums"]["mgmt_entity_type_enum"]
          id?: string
          metadata?: Json
          op_type?: Database["public"]["Enums"]["mgmt_op_type_enum"]
          source_id?: string
          target_id?: string | null
          undo_metadata?: Json
          undone_at?: string | null
          undone_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      realtime_signals: {
        Row: {
          created_at: string
          entity_key: string
          op: Database["public"]["Enums"]["realtime_op_enum"]
          payload: Json
          seq: number
          topic: Database["public"]["Enums"]["realtime_topic_enum"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_key: string
          op: Database["public"]["Enums"]["realtime_op_enum"]
          payload?: Json
          seq?: number
          topic: Database["public"]["Enums"]["realtime_topic_enum"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_key?: string
          op?: Database["public"]["Enums"]["realtime_op_enum"]
          payload?: Json
          seq?: number
          topic?: Database["public"]["Enums"]["realtime_topic_enum"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      review_logs: {
        Row: {
          algo_version: string
          card_id: string | null
          client_request_id: string | null
          config_id: number | null
          created_at: string
          difficulty: number
          elapsed_days: number
          id: string
          last_elapsed_days: number
          post_state: Json
          question_id: string | null
          rating: number
          review: string
          review_duration_ms: number | null
          scheduled_days: number
          source: string | null
          stability: number
          state: number
          user_id: string
        }
        Insert: {
          algo_version?: string
          card_id?: string | null
          client_request_id?: string | null
          config_id?: number | null
          created_at?: string
          difficulty: number
          elapsed_days: number
          id?: string
          last_elapsed_days: number
          post_state?: Json
          question_id?: string | null
          rating: number
          review?: string
          review_duration_ms?: number | null
          scheduled_days: number
          source?: string | null
          stability: number
          state: number
          user_id: string
        }
        Update: {
          algo_version?: string
          card_id?: string | null
          client_request_id?: string | null
          config_id?: number | null
          created_at?: string
          difficulty?: number
          elapsed_days?: number
          id?: string
          last_elapsed_days?: number
          post_state?: Json
          question_id?: string | null
          rating?: number
          review?: string
          review_duration_ms?: number | null
          scheduled_days?: number
          source?: string | null
          stability?: number
          state?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_logs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_logs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "v_due_cards"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "review_logs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "fsrs_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_logs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "error_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_settings: {
        Row: {
          created_at: string
          enable_fuzz: boolean | null
          id: number
          maximum_interval: number | null
          request_retention: number | null
          rollover_hour: number
          time_estimation: Json | null
          timezone: string
          updated_at: string
          user_id: string | null
          weights: Json | null
        }
        Insert: {
          created_at?: string
          enable_fuzz?: boolean | null
          id?: number
          maximum_interval?: number | null
          request_retention?: number | null
          rollover_hour?: number
          time_estimation?: Json | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
          weights?: Json | null
        }
        Update: {
          created_at?: string
          enable_fuzz?: boolean | null
          id?: number
          maximum_interval?: number | null
          request_retention?: number | null
          rollover_hour?: number
          time_estimation?: Json | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
          weights?: Json | null
        }
        Relationships: []
      }
      subjects: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_dashboard_pulse: {
        Row: {
          created_at: string
          due_count: number
          last_study_day: string | null
          next_due_at: string | null
          seq: number
          streak_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_count?: number
          last_study_day?: string | null
          next_due_at?: string | null
          seq?: number
          streak_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_count?: number
          last_study_day?: string | null
          next_due_at?: string | null
          seq?: number
          streak_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_due_cards: {
        Row: {
          card_difficulty: number | null
          card_id: string | null
          due: string | null
          lapses: number | null
          question_difficulty:
          | Database["public"]["Enums"]["difficulty_enum"]
          | null
          question_id: string | null
          question_type:
          | Database["public"]["Enums"]["question_type_enum"]
          | null
          reps: number | null
          stability: number | null
          state: number | null
          subject_color: string | null
          subject_name: string | null
          title: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "error_questions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_fork_status: { Args: { p_question_id: string }; Returns: Json }
      claim_import_job: {
        Args: { p_lock_duration_minutes?: number; p_worker_id: string }
        Returns: Json
      }
      compute_user_study_day: {
        Args: { p_ts: string; p_user_id: string }
        Returns: string
      }
      fork_question_to_private: {
        Args: { p_question_id: string }
        Returns: string
      }
      get_exam_questions: {
        Args: { p_count?: number; p_subject_id?: string; p_tag_ids?: string[] }
        Returns: string[]
      }
      get_user_preferences: {
        Args: never
        Returns: {
          display_name: string | null
          countdown_mode: string
          custom_target_time: string | null
          custom_target_date: string | null
          custom_event_name: string | null
          rollover_hour: number
          timezone: string
          theme_mode: string
          light_theme: string
          dark_theme: string
          ux_reflections: boolean
          ux_animations: boolean
          ux_reduced_motion: boolean
          notify_push: boolean
          notify_drift: boolean
          notify_sync: boolean
          language: string
          has_preferences: boolean
        }[]
      }
      merge_subjects: {
        Args: { p_source_id: string; p_target_id: string }
        Returns: string
      }
      merge_tags: {
        Args: { p_source_id: string; p_target_id: string }
        Returns: string
      }
      purge_realtime_signals: {
        Args: { p_days_threshold?: number }
        Returns: number
      }
      purge_soft_deleted_data: {
        Args: { p_days_threshold?: number }
        Returns: Json
      }
      refresh_user_dashboard_pulse: {
        Args: { p_review_ts?: string; p_user_id: string }
        Returns: undefined
      }
      rt_is_suppress_allowed: { Args: never; Returns: boolean }
      submit_review: {
        Args: {
          p_algo_version?: string
          p_card_id: string
          p_client_request_id?: string
          p_duration_ms?: number
          p_new_difficulty: number
          p_new_due: string
          p_new_stability: number
          p_new_state: number
          p_rating: number
          p_scheduled_days: number
          p_user_id: string
          p_weights?: Json
        }
        Returns: Json
      }
      sync_fork: { Args: { p_question_id: string }; Returns: undefined }
      undo_management_op: { Args: { p_log_id: string }; Returns: boolean }
      update_user_preferences: {
        Args: {
          p_clear_custom_event_name?: boolean
          p_clear_custom_target_date?: boolean
          p_clear_display_name?: boolean
          p_countdown_mode?: string | null
          p_custom_event_name?: string | null
          p_custom_target_date?: string | null
          p_custom_target_time?: string | null
          p_dark_theme?: string | null
          p_display_name?: string | null
          p_language?: string | null
          p_light_theme?: string | null
          p_notify_drift?: boolean | null
          p_notify_push?: boolean | null
          p_notify_sync?: boolean | null
          p_rollover_hour?: number | null
          p_theme_mode?: string | null
          p_timezone?: string | null
          p_ux_animations?: boolean | null
          p_ux_reduced_motion?: boolean | null
          p_ux_reflections?: boolean | null
        }
        Returns: boolean
      }
      upsert_realtime_signal: {
        Args: {
          p_entity_key: string
          p_op: Database["public"]["Enums"]["realtime_op_enum"]
          p_payload?: Json
          p_throttle_ms?: number
          p_topic: Database["public"]["Enums"]["realtime_topic_enum"]
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_realtime_signal_for_question_watchers: {
        Args: {
          p_entity_key: string
          p_op: Database["public"]["Enums"]["realtime_op_enum"]
          p_payload?: Json
          p_question_id: string
          p_throttle_ms?: number
          p_topic: Database["public"]["Enums"]["realtime_topic_enum"]
        }
        Returns: undefined
      }
    }
    Enums: {
      answer_mode_enum: "online" | "paper"
      difficulty_enum: "easy" | "medium" | "hard"
      exam_mode_enum: "exam" | "practice"
      exam_status_enum: "in_progress" | "completed" | "abandoned"
      import_file_type_enum: "csv" | "xlsx" | "json" | "pdf"
      job_status_enum: "queued" | "running" | "partial" | "done" | "failed"
      mgmt_entity_type_enum: "subject" | "tag"
      mgmt_op_type_enum: "merge" | "delete"
      question_type_enum: "choice" | "fill_blank" | "short_answer"
      realtime_op_enum: "UPSERT" | "UPDATE" | "REMOVE" | "REFRESH"
      realtime_topic_enum:
      | "question"
      | "question_list"
      | "exam"
      | "exam_list"
      | "due_list"
      | "asset"
      | "job"
      | "card"
      | "card_overlay"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {
      answer_mode_enum: ["online", "paper"],
      difficulty_enum: ["easy", "medium", "hard"],
      exam_mode_enum: ["exam", "practice"],
      exam_status_enum: ["in_progress", "completed", "abandoned"],
      import_file_type_enum: ["csv", "xlsx", "json", "pdf"],
      job_status_enum: ["queued", "running", "partial", "done", "failed"],
      mgmt_entity_type_enum: ["subject", "tag"],
      mgmt_op_type_enum: ["merge", "delete"],
      question_type_enum: ["choice", "fill_blank", "short_answer"],
      realtime_op_enum: ["UPSERT", "UPDATE", "REMOVE", "REFRESH"],
      realtime_topic_enum: [
        "question",
        "question_list",
        "exam",
        "exam_list",
        "due_list",
        "asset",
        "job",
        "card",
        "card_overlay",
      ],
    },
  },
} as const
