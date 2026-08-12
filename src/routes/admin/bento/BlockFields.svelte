<script lang="ts">
	import AssetInput from '$lib/ui/AssetInput.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { fieldClass } from '$lib/ui/styles';
	import { fieldsFor, type WidgetKind } from '$lib/widgets/catalog';

	type Props = {
		kind: WidgetKind;
		values: Record<string, string>;
		errors?: Record<string, string>;
		assetsOrigin: string;
	};

	let { kind, values, errors = {}, assetsOrigin }: Props = $props();

	// Generated from the field descriptors rather than hand-written per kind:
	// every widget gets the same labels, hints and ARIA wiring, and a new kind
	// cannot quietly ship a worse form than its neighbours.
	let fields = $derived(fieldsFor(kind));
</script>

{#each fields as field (field.name)}
	<Field
		id="f-{field.name}"
		label={field.label}
		hint={field.hint}
		error={errors[field.name]}
		optional={field.optional}
	>
		{#snippet children({ id, describedBy, invalid })}
			{#if field.type === 'textarea'}
				<textarea
					{id}
					name={field.name}
					rows="4"
					value={values[field.name] ?? ''}
					placeholder={field.placeholder}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					class="{fieldClass(invalid)} resize-y"
				></textarea>
			{:else if field.type === 'lines'}
				<textarea
					{id}
					name={field.name}
					rows="5"
					value={values[field.name] ?? ''}
					placeholder={field.placeholder}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					spellcheck="false"
					class="{fieldClass(invalid)} resize-y font-mono text-xs"
				></textarea>
			{:else if field.type === 'select'}
				<select
					{id}
					name={field.name}
					aria-describedby={describedBy}
					class={fieldClass(invalid)}
				>
					{#each field.options ?? [] as option (option.value)}
						<option value={option.value} selected={values[field.name] === option.value}>
							{option.label}
						</option>
					{/each}
				</select>
			{:else if field.type === 'asset'}
				<AssetInput
					{id}
					name={field.name}
					value={values[field.name] ?? ''}
					{assetsOrigin}
					{describedBy}
					{invalid}
				/>
			{:else}
				<input
					{id}
					name={field.name}
					type={field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text'}
					value={values[field.name] ?? ''}
					placeholder={field.placeholder}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					spellcheck={field.type === 'url' ? 'false' : undefined}
					class={fieldClass(invalid)}
				/>
			{/if}
		{/snippet}
	</Field>
{/each}
