--
-- PostgreSQL database dump
--

-- \restrict 6lqigHHXhJhNclQeDw8oRKWxZeV8HqwizfKHOXpmaTrvNpshqY6qMSfQ0F1pv6K

-- Dumped from database version 14.18
-- Dumped by pg_dump version 16.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = on;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pages (
    page_id text NOT NULL,
    title text NOT NULL,
    slug text,
    authors jsonb DEFAULT jsonb_build_array(),
    tags jsonb DEFAULT jsonb_build_array(),
    publish_at timestamp with time zone,
    meta jsonb DEFAULT jsonb_build_object(),
    content text,
    summary text,
    cover text,
    last_synced_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL,
    datasource_id text NOT NULL,
    datasource_alias text NOT NULL
);


--
-- Name: COLUMN pages.datasource_alias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pages.datasource_alias IS 'Non-secret alias for datasource (used by public queries).';


--
-- Name: pages pages_datasource_alias_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_datasource_alias_slug_key UNIQUE (datasource_alias, slug);


--
-- Name: pages pages_datasource_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_datasource_id_slug_key UNIQUE (datasource_id, slug);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (page_id);


--
-- Name: idx_pages_datasource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_datasource ON public.pages USING btree (datasource_id);


--
-- Name: idx_pages_datasource_alias; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_datasource_alias ON public.pages USING btree (datasource_alias);


--
-- Name: idx_pages_datasource_alias_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_datasource_alias_slug ON public.pages USING btree (datasource_alias, slug);


--
-- Name: idx_pages_meta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_meta ON public.pages USING gin (meta);


--
-- Name: idx_pages_publish_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_publish_at ON public.pages USING btree (publish_at);


--
-- Name: idx_pages_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_tags ON public.pages USING gin (tags);



CREATE INDEX pages_summary_idx ON public.pages USING btree (summary);


CREATE INDEX pages_title_idx ON public.pages USING btree (title);


--
-- Name: pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

--
-- Name: pages Public pages read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public pages read access" ON public.pages FOR SELECT USING ((publish_at IS NOT NULL) AND (publish_at <= NOW()));


--
-- Name: pages Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.pages FOR ALL USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- PostgreSQL database dump complete
--

-- \unrestrict 6lqigHHXhJhNclQeDw8oRKWxZeV8HqwizfKHOXpmaTrvNpshqY6qMSfQ0F1pv6K

