import type { Component } from 'svelte';
import Clock from './Clock.svelte';
import Contact from './Contact.svelte';
import Cta from './Cta.svelte';
import Github from './Github.svelte';
import Grass from './Grass.svelte';
import Heading from './Heading.svelte';
import Image from './Image.svelte';
import Link from './Link.svelte';
import List from './List.svelte';
import MapWidget from './Map.svelte';
import Post from './Post.svelte';
import Quote from './Quote.svelte';
import Social from './Social.svelte';
import Spacer from './Spacer.svelte';
import Stack from './Stack.svelte';
import Stat from './Stat.svelte';
import Text from './Text.svelte';
import Timeline from './Timeline.svelte';
import Video from './Video.svelte';
import Weather from './Weather.svelte';
import { widgets, type WidgetKind } from './catalog';

/**
 * Adding a kind is one entry here, one entry in `catalog.ts`, and one
 * component file. Nothing else in the codebase changes: the editor derives its
 * form from the field descriptors and its span options from `spans`, and the
 * publish path validates through the derived discriminated union.
 */
export const components: Record<WidgetKind, Component<any>> = {
	link: Link,
	cta: Cta,
	text: Text,
	heading: Heading,
	image: Image,
	social: Social,
	stat: Stat,
	quote: Quote,
	list: List,
	stack: Stack,
	timeline: Timeline,
	contact: Contact,
	map: MapWidget,
	spacer: Spacer,
	clock: Clock,
	github: Github,
	grass: Grass,
	weather: Weather,
	post: Post,
	video: Video
};

export { widgets };
export type { WidgetKind };
export * from './catalog';
